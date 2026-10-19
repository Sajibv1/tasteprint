#!/usr/bin/env node
/**
 * Eval harness runner.
 *
 * Usage:
 *   npm run eval                 # against http://localhost:3000
 *   BASE_URL=https://... npm run eval
 *   npm run eval -- --only=ghibli-birthday
 *   npm run eval -- --engine=pipeline
 *
 * Exits non-zero when any profile fails, so it can gate a deploy or a demo.
 */

const port = process.env.PORT || "3001";
const baseUrl = (process.env.BASE_URL || `http://127.0.0.1:${port}`).replace(/\/+$/, "");
const args = process.argv.slice(2);
const only = args.find((arg) => arg.startsWith("--only="))?.split("=")[1];
const engine = args.find((arg) => arg.startsWith("--engine="))?.split("=")[1];

const url = new URL(`${baseUrl}/api/eval`);
if (only) url.searchParams.set("only", only);
if (engine) url.searchParams.set("engine", engine);

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

async function main() {
  console.log(`${BOLD}Tasteprint eval${RESET} ${DIM}→ ${url.toString()}${RESET}\n`);
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(300_000) });
  } catch (error) {
    console.error(`${RED}Could not reach the app.${RESET} Is it running? (${error instanceof Error ? error.message : error})`);
    process.exit(2);
  }
  if (!response.ok) {
    console.error(`${RED}HTTP ${response.status}${RESET}: ${(await response.text()).slice(0, 400)}`);
    process.exit(2);
  }
  const payload = await response.json();
  if (!Array.isArray(payload.reports)) {
    console.error(`${RED}Unexpected response:${RESET}`, payload);
    process.exit(2);
  }

  for (const report of payload.reports) {
    const mark = report.ok ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
    console.log(`${mark}  ${BOLD}${report.id}${RESET} ${DIM}(${report.mode}, ${report.durationMs}ms)${RESET}`);
    console.log(`      ${DIM}${report.label}${RESET}`);
    if (report.error) console.log(`      ${RED}error: ${report.error}${RESET}`);
    for (const failure of report.failures) console.log(`      ${RED}✗ ${failure}${RESET}`);
    if (report.picks?.length) {
      console.log(`      ${report.picks.map((pick) => `${pick.lane}: ${pick.titles.join(" + ")} ($${pick.total})`).join("\n      ")}`);
    }
    console.log();
  }

  console.log(`${BOLD}${payload.passed}/${payload.total} profiles passed${RESET} — engine: ${payload.engine}`);
  process.exit(payload.success ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
