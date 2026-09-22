import { APIError } from "@typesafe-ai/sdk";
import { getJev, NO_KEY_MESSAGE } from "@/lib/jev-client";
import { buildQuestions, buildState } from "@/lib/questions";
import { applyAnswers, type Answers } from "@/lib/apply";
import { parseExplicit } from "@/lib/explicit";
import type { Design } from "@/lib/design";
import { mockAnswers } from "@/lib/mock";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    transcript: string;
    design: Design;
    selection: string | null;
    recent: string | null;
  };
  const transcript = (body.transcript ?? "").trim();
  if (!transcript) return Response.json({ error: "Empty transcript" }, { status: 400 });

  const ctx = { transcript, design: body.design, selection: body.selection ?? null, recent: body.recent ?? null };
  const explicit = parseExplicit(transcript);

  if (process.env.JEV_MOCK === "1") {
    const answers = mockAnswers(transcript, body.design, ctx.selection);
    const result = applyAnswers(body.design, answers, explicit, ctx.selection, ctx.recent);
    return Response.json({ ...result, answers, explicit, ms: 0, model: "mock (JEV_MOCK=1)" });
  }

  const jev = getJev();
  if (!jev) return Response.json({ error: NO_KEY_MESSAGE }, { status: 500 });

  const t0 = Date.now();
  try {
    const res = await jev.client.systemOne({ state: buildState(ctx), questions: buildQuestions(ctx) });
    const ms = Date.now() - t0;
    const answers = res.answers as unknown as Answers;
    const result = applyAnswers(body.design, answers, explicit, ctx.selection, ctx.recent);
    return Response.json({ ...result, answers, explicit, ms, model: `${res.model} via ${jev.provider}`, usage: res.usage });
  } catch (e) {
    const msg = e instanceof APIError ? `${e.name}: ${e.message}` : e instanceof Error ? e.message : String(e);
    return Response.json({ error: msg }, { status: 502 });
  }
}
