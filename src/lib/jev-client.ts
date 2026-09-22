// One Jev client, four ways to reach it. TypeSafe's own signups are paused
// (Sept 2026), but the same model is served by OpenRouter, Vercel AI Gateway
// and Cloudflare Workers AI. Set whichever key you have in .env.local.
import { TypeSafeClient, type Fetch } from "@typesafe-ai/sdk";

export type Provider = "typesafe" | "openrouter" | "vercel" | "cloudflare";

export interface JevClient {
  client: TypeSafeClient;
  provider: Provider;
  model: string;
}

const env = (k: string) => process.env[k]?.trim() || undefined;

function detect(): Provider | null {
  const forced = env("JEV_PROVIDER") as Provider | undefined;
  if (forced) return forced;
  if (env("TYPESAFE_API_KEY")) return "typesafe";
  if (env("OPENROUTER_API_KEY")) return "openrouter";
  if (env("AI_GATEWAY_API_KEY")) return "vercel";
  if (env("CLOUDFLARE_ACCOUNT_ID") && env("CLOUDFLARE_API_TOKEN")) return "cloudflare";
  return null;
}

/** Workers AI uses POST /ai/run with {model, input:{state,questions}}; everything else is TypeSafe-shaped. */
function cloudflareFetch(accountId: string): Fetch {
  return async (input, init) => {
    if (!/\/v1\/systemone$/.test(input)) return fetch(input, init);
    const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string; state: unknown; questions: unknown };
    const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run`, {
      ...init,
      body: JSON.stringify({ model: "typesafe/jev", input: { state: body.state, questions: body.questions } }),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {}
    // Some Workers AI responses are wrapped: { result, success, errors }
    const j = json as { result?: unknown; success?: boolean; errors?: { message: string }[] } | null;
    if (j && typeof j === "object" && "success" in j) {
      if (!j.success) return new Response(JSON.stringify({ message: j.errors?.map((e) => e.message).join("; ") || "Workers AI error", error_type: "provider" }), { status: res.ok ? 502 : res.status, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify(j.result), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(text, { status: res.status, headers: { "content-type": "application/json" } });
  };
}

let cached: JevClient | null | undefined;

export function getJev(): JevClient | null {
  if (cached !== undefined) return cached;
  const provider = detect();
  if (!provider) return (cached = null);
  const common = { timeout: 15_000 };
  switch (provider) {
    case "typesafe":
      cached = { provider, model: env("TYPESAFE_DEFAULT_MODEL") ?? "jev-latest", client: new TypeSafeClient({ ...common, apiKey: env("TYPESAFE_API_KEY") }) };
      break;
    case "openrouter":
      cached = { provider, model: "jev-latest", client: new TypeSafeClient({ ...common, apiKey: env("OPENROUTER_API_KEY"), baseURL: "https://openrouter.ai/api", defaultModel: "jev-latest" }) };
      break;
    case "vercel":
      cached = { provider, model: "typesafe-ai/jev", client: new TypeSafeClient({ ...common, apiKey: env("AI_GATEWAY_API_KEY"), baseURL: "https://ai-gateway.vercel.sh/typesafe", defaultModel: "typesafe-ai/jev" }) };
      break;
    case "cloudflare":
      cached = {
        provider,
        model: "typesafe/jev",
        client: new TypeSafeClient({ ...common, apiKey: env("CLOUDFLARE_API_TOKEN"), baseURL: "https://api.cloudflare.com/client/v4", defaultModel: "typesafe/jev", fetch: cloudflareFetch(env("CLOUDFLARE_ACCOUNT_ID")!) }),
      };
      break;
  }
  return cached;
}

export const NO_KEY_MESSAGE =
  "No Jev credentials found. TypeSafe signups are paused, so put ONE of these in .env.local and restart: " +
  "OPENROUTER_API_KEY (openrouter.ai/keys), AI_GATEWAY_API_KEY (Vercel AI Gateway), " +
  "CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN (Workers AI), or TYPESAFE_API_KEY. Or JEV_MOCK=1 for offline testing.";
