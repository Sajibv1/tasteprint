#!/usr/bin/env node
/**
 * Script to record golden runs from the live stream endpoint into src/data/demo-scenarios.json
 */
import fs from "fs";
import path from "path";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3001";
const outPath = path.resolve("./src/data/demo-scenarios.json");

const SCENARIOS_TO_RECORD = [
  {
    id: "persona-ghibli",
    label: "Priya — Björk, Studio Ghibli, Sally Rooney ($80 Birthday)",
    request: {
      recipientName: "Priya",
      occasion: "Birthday",
      interests: ["Björk", "Studio Ghibli", "Sally Rooney"],
      budget: { min: 0, max: 80 },
    },
  },
  {
    id: "persona-scifi",
    label: "Devon — Blade Runner, Dune, Frank Ocean ($120 Holidays)",
    request: {
      recipientName: "Devon",
      occasion: "Holidays",
      interests: ["Blade Runner", "Dune", "Frank Ocean"],
      budget: { min: 0, max: 120 },
    },
  },
];

async function recordScenario(entry) {
  console.log(`Recording scenario: ${entry.label}...`);
  const response = await fetch(`${BASE_URL}/api/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ request: entry.request }),
  });

  if (!response.ok) {
    throw new Error(`Failed to stream scenario: ${response.status} ${await response.text()}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events = [];
  let finalResult = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n\n");
    buffer = lines.pop() || "";

    for (const block of lines) {
      for (const line of block.split("\n")) {
        if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6));
            events.push(data);
            if (data.type === "result" && data.result) {
              finalResult = data.result;
              break;
            }
            if (data.type === "error") {
              throw new Error(`Stream error: ${data.message}`);
            }
          } catch (e) {
            console.error("Parse error:", e);
          }
        }
      }
    }
    if (finalResult) break;
  }

  if (!finalResult) {
    throw new Error(`No final result recorded for ${entry.id}`);
  }

  console.log(`✓ Recorded ${events.length} events for ${entry.id} (Picks: ${finalResult.picks?.length || 0})`);
  return {
    id: entry.id,
    label: entry.label,
    request: {
      recipientName: entry.request.recipientName,
      interests: entry.request.interests,
      occasion: entry.request.occasion,
      budgetMax: entry.request.budget.max,
    },
    events,
    result: finalResult,
  };
}

async function main() {
  let existing = [];
  try {
    existing = JSON.parse(fs.readFileSync(outPath, "utf-8"));
    if (!Array.isArray(existing)) existing = [];
  } catch {
    existing = [];
  }

  for (const entry of SCENARIOS_TO_RECORD) {
    try {
      const data = await recordScenario(entry);
      existing = existing.filter((item) => item.id !== entry.id).concat(data);
      fs.writeFileSync(outPath, JSON.stringify(existing, null, 2) + "\n");
      console.log(`Saved ${entry.id} to ${outPath}`);
    } catch (err) {
      console.error(`Failed to record ${entry.id}:`, err);
    }
  }

  console.log(`\nFinished! Total scenarios stored: ${existing.length}`);
}

main().catch((err) => {
  console.error("Recording failed:", err);
  process.exit(1);
});
