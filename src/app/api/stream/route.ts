import { NextResponse } from "next/server";
import { recommend, warmCatalog } from "@/lib/agent/pipeline";
import { applyRefinement, noteToActions } from "@/lib/agent/actions";
import { interpretNote } from "@/lib/agent/llm-note";
import { QlooError } from "@/lib/qloo/client";
import {
  emptyConstraints,
  type AgentEvent,
  type RecommendRequest,
  type RefineAction,
  type SessionConstraints,
} from "@/lib/agent/types";

export const maxDuration = 60;

interface StreamBody {
  kind?: string;
  request?: unknown;
  action?: RefineAction;
  constraints?: Partial<SessionConstraints>;
}

interface RunPlan {
  request: RecommendRequest;
  constraints?: Partial<SessionConstraints>;
  shopperNote?: string;
  refinementNotes?: string[];
}

function hasMeaningfulConstraints(constraints?: Partial<SessionConstraints>): boolean {
  return Boolean(
    constraints &&
      ((constraints.avoidItemIds?.length ?? 0) > 0 ||
        (constraints.priorItemIds?.length ?? 0) > 0 ||
        (constraints.boostInterests?.length ?? 0) > 0 ||
        (constraints.muteInterests?.length ?? 0) > 0 ||
        (constraints.mood ?? false) ||
        constraints.budgetMin !== undefined ||
        constraints.budgetMax !== undefined),
  );
}

async function planFrom(body: StreamBody): Promise<{ plan?: RunPlan; error?: string }> {
  if (!body.request || typeof body.request !== "object") {
    return { error: "Request body must be a JSON object with a `request` field." };
  }
  const request = body.request as RecommendRequest;
  if (body.kind !== "refine") {
    return { plan: { request } };
  }
  if (!body.action) {
    return { error: "A refinement run needs an `action`." };
  }
  let actions: RefineAction[] = [body.action];
  const shopperNote = body.action.kind === "note" ? body.action.text : undefined;
  if (body.action.kind === "note") {
    const llmActions = await interpretNote(body.action.text, request.interests ?? []);
    actions = llmActions && llmActions.length > 0 ? llmActions : noteToActions(body.action.text, request.interests ?? []);
  }
  let constraints: Partial<SessionConstraints> = { ...emptyConstraints(), ...body.constraints };
  const notes: string[] = [];
  for (const action of actions) {
    const applied = applyRefinement(action, { ...emptyConstraints(), ...constraints }, request);
    constraints = applied.constraints;
    notes.push(...applied.notes);
  }
  if (shopperNote && notes.length === 0) {
    notes.push(`logged “${shopperNote.slice(0, 80)}” — no structural change, but the copy takes it into account`);
  }
  return {
    plan: {
      request,
      constraints,
      shopperNote,
      refinementNotes: notes,
    },
  };
}

function errorPayload(error: unknown, fallbackStatus: number): { status: number; message: string } {
  if (error instanceof QlooError) {
    const status = error.status >= 400 && error.status < 500 ? error.status : 502;
    return { status, message: error.message };
  }
  console.error("stream failed:", error);
  return { status: fallbackStatus, message: "Something went wrong building the recommendations." };
}

export async function POST(request: Request) {
  warmCatalog();

  let body: StreamBody;
  try {
    body = (await request.json()) as StreamBody;
  } catch {
    return NextResponse.json({ success: false, error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ success: false, error: "Request body must be a JSON object." }, { status: 400 });
  }
  const { plan, error } = await planFrom(body);
  if (!plan) {
    return NextResponse.json({ success: false, error }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: AgentEvent): void => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          open = false;
        }
      };
      try {
        for (const note of plan.refinementNotes ?? []) {
          send({ type: "agent-note", message: note });
        }
        const result = await recommend(plan.request, {
          sink: send,
          constraints: hasMeaningfulConstraints(plan.constraints) ? plan.constraints : undefined,
          shopperNote: plan.shopperNote,
        });
        send({ type: "result", result, constraints: { ...emptyConstraints(), ...plan.constraints } });
      } catch (caught) {
        const payload = errorPayload(caught, 500);
        send({ type: "error", message: payload.message });
      } finally {
        try {
          controller.close();
        } catch {
          // stream already closed by the client disconnecting
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
