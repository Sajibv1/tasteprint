import type { AgentEvent } from "./agent/types";

/** Parse the agent's SSE stream independently of network chunk boundaries, including CRLF streams. */
export async function* readAgentEvents(response: Response): AsyncGenerator<AgentEvent> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("The gift agent stopped before the search could start.");
  const decoder = new TextDecoder();
  let buffer = "";
  const parse = (block: string): AgentEvent | null => {
    const data = block.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (!data) return null;
    return JSON.parse(data) as AgentEvent;
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer = (buffer + decoder.decode(value, { stream: !done })).replace(/\r\n/g, "\n");
      let separator = buffer.indexOf("\n\n");
      while (separator !== -1) {
        const event = parse(buffer.slice(0, separator));
        buffer = buffer.slice(separator + 2);
        if (event) yield event;
        separator = buffer.indexOf("\n\n");
      }
      if (done) {
        const event = parse(buffer);
        if (event) yield event;
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function replayDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
    signal.addEventListener("abort", abort, { once: true });
  });
}
