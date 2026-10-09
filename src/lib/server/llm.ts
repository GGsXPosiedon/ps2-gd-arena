// Server-only LLM access. Picks a provider from env; "mock" when no key is configured.
//
//   GEMINI_API_KEY      -> Gemini via its OpenAI-compatible endpoint (free tier works)
//   GEMINI_API_KEY_2    -> optional backup Gemini key (another project), used when the first one is rate-limited
//   ANTHROPIC_API_KEY   -> Claude
//   LLM_BASE_URL + LLM_API_KEY -> any OpenAI-compatible API (Groq, OpenRouter, Ollama, OpenAI)
//   SARVAM_API_KEY      -> Sarvam's chat model is the last resort when every Gemini model fails (LLM_FALLBACK=none
//                          turns that off); LLM_PROVIDER=sarvam uses it for everything
//   LLM_PROVIDER=mock   -> force the offline mock (used by e2e tests)
//   LLM_MODEL_FAST / LLM_MODEL_SMART override the default models.

export type ProviderName = "gemini" | "anthropic" | "openai-compatible" | "sarvam" | "mock";

interface Provider {
  name: ProviderName;
  baseUrl: string;
  apiKey: string;
  backupKeys?: string[]; // tried for the same model when the main key is rate-limited
  fast: string;
  smart: string;
  fallbacks?: { fast: string[]; smart: string[] }; // tried in order when a model is overloaded or rate-limited
}

// Sarvam's voice-agent model: ~0.6 s per line, no thinking tokens, 32K context.
const SARVAM_URL = "https://api.sarvam.ai/v1";
const SARVAM_MODEL = "sarvam-105b-conversations";

export function getProvider(): Provider {
  const env = process.env;
  const forced = env.LLM_PROVIDER;
  const fastOverride = env.LLM_MODEL_FAST;
  const smartOverride = env.LLM_MODEL_SMART;
  if (forced === "mock") return { name: "mock", baseUrl: "", apiKey: "", fast: "mock", smart: "mock" };
  // "sarvam:<model>" chain entries switch to Sarvam for that attempt (see streamText).
  const sarvam = env.SARVAM_API_KEY && env.LLM_FALLBACK !== "none" ? [`sarvam:${SARVAM_MODEL}`] : [];
  if (forced === "sarvam" && env.SARVAM_API_KEY) {
    return { name: "sarvam", baseUrl: SARVAM_URL, apiKey: env.SARVAM_API_KEY, fast: fastOverride || SARVAM_MODEL, smart: smartOverride || SARVAM_MODEL };
  }
  if ((forced === "gemini" || !forced) && env.GEMINI_API_KEY) {
    return {
      name: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: env.GEMINI_API_KEY,
      backupKeys: env.GEMINI_API_KEY_2 ? [env.GEMINI_API_KEY_2] : [],
      // Measured on the free tier (Oct 2026): 3.5 Flash Lite answers in ~1–1.6 s; 3.8 Flash often took 4–20 s or timed out.
      fast: fastOverride || "gemini-3.5-flash-lite",
      smart: smartOverride || "gemini-3.5-flash", // 3.6 Flash returned 503 "high demand" repeatedly
      fallbacks: {
        // 3.1 Flash Lite measured 8–10 s to first token; keep it as the last resort.
        fast: ["gemini-3.5-flash", "gemini-3.6-flash", ...sarvam, "gemini-3.1-flash-lite"],
        smart: ["gemini-3.6-flash", "gemini-3.5-flash-lite", ...sarvam, "gemini-3.1-flash-lite"],
      },
    };
  }
  if ((forced === "anthropic" || !forced) && env.ANTHROPIC_API_KEY) {
    return {
      name: "anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      apiKey: env.ANTHROPIC_API_KEY,
      fast: fastOverride || "claude-haiku-4-5-20251001",
      smart: smartOverride || "claude-sonnet-5-5",
    };
  }
  if (env.LLM_BASE_URL && env.LLM_API_KEY !== undefined) {
    return {
      name: "openai-compatible",
      baseUrl: env.LLM_BASE_URL.replace(/\/$/, ""),
      apiKey: env.LLM_API_KEY,
      fast: fastOverride || "gpt-4o-mini",
      smart: smartOverride || fastOverride || "gpt-4o-mini",
    };
  }
  return { name: "mock", baseUrl: "", apiKey: "", fast: "mock", smart: "mock" };
}

/** True when the request asks for the offline mock (the e2e suite sends this header so tests never use real AI quota). */
export function wantsMock(request: Request): boolean {
  return request.headers.get("x-floor-mock") === "1";
}

export interface LlmRequest {
  system: string;
  user: string;
  model: "fast" | "smart";
  maxTokens: number;
  temperature?: number;
  json?: boolean;
  timeoutMs?: number;
  modelId?: string; // explicit model (used for fallbacks)
  /** Thinking effort for models that support it (Gemini 3.x can't turn it off, only down to "minimal"). */
  reasoning?: "minimal" | "low" | "medium" | "high"; // gemini-3.8-flash supports low and up
}

/** Streams text deltas. Throws on HTTP/network errors. Not for the mock provider. */
// Models that recently failed (quota used up, overloaded, too slow) are skipped for a while so a session
// doesn't pay a failed round-trip on every turn.
const downUntil = new Map<string, number>();
function markDown(model: string, ms: number) {
  downUntil.set(model, Date.now() + ms);
}
function isDown(model: string) {
  return (downUntil.get(model) ?? 0) > Date.now();
}

// A chain entry is a model id, or "model@n" for the same model on backup key n (each key has its own quota).
function fullChain(p: Provider, model: LlmRequest["model"]): string[] {
  const models = [model === "fast" ? p.fast : p.smart, ...(p.fallbacks?.[model] ?? [])];
  return models.flatMap((m) => (m.startsWith("sarvam:") ? [m] : [m, ...(p.backupKeys ?? []).map((_, i) => `${m}@${i + 1}`)]));
}

/** The models to try for a request, healthy ones first. */
export function modelChain(model: LlmRequest["model"]): string[] {
  const all = fullChain(getProvider(), model);
  const healthy = all.filter((m) => !isDown(m));
  return healthy.length ? healthy : all;
}

/**
 * Streams from the first healthy model; if it hasn't produced a token within `hedgeMs`, starts the next model
 * in parallel and keeps whichever answers first (the other is abandoned).
 */
export async function* streamTextHedged(req: LlmRequest, hedgeMs = 3000): AsyncGenerator<string> {
  const chain = modelChain(req.model);
  if (chain.length < 2 || req.modelId) {
    yield* streamText(req);
    return;
  }
  type First = { from: "a" | "b"; r?: IteratorResult<string>; error?: unknown };
  const a = streamText({ ...req, modelId: chain[0] });
  const firstA: Promise<First> = a.next().then((r) => ({ from: "a" as const, r }), (error) => ({ from: "a" as const, error }));
  const slow = new Promise<"slow">((res) => setTimeout(() => res("slow"), hedgeMs));
  const early = await Promise.race([firstA, slow]);
  if (early !== "slow" && !early.error) {
    if (!early.r!.done) yield early.r!.value;
    yield* a;
    return;
  }
  if (early === "slow") markDown(chain[0], 60_000); // slow right now: prefer the next model for a minute
  // Slowness is usually the model, not the key: hedge on a different model when there is one.
  const base = (m: string) => m.split("@")[0];
  const second = early === "slow" ? (chain.find((m) => base(m) !== base(chain[0])) ?? chain[1]) : chain[1];
  const b = streamText({ ...req, modelId: second });
  const firstB: Promise<First> = b.next().then((r) => ({ from: "b" as const, r }), (error) => ({ from: "b" as const, error }));
  const candidates = early === "slow" ? [firstA, firstB] : [firstB];
  let winner = await Promise.race(candidates);
  if (winner.error && candidates.length === 2) winner = await (winner.from === "a" ? firstB : firstA);
  if (winner.error) throw winner.error;
  const [gen, loser] = winner.from === "a" ? [a, b] : [b, a];
  loser.return(undefined).catch(() => {});
  if (!winner.r!.done) yield winner.r!.value;
  yield* gen;
}

export async function* streamText(req: LlmRequest): AsyncGenerator<string> {
  const p = getProvider();
  if (p.name === "mock") throw new Error("streamText called with mock provider");
  const slot = req.modelId ?? modelChain(req.model)[0];
  const viaSarvam = slot.startsWith("sarvam:");
  const [model, keyIndex] = slot.replace(/^sarvam:/, "").split("@");
  const apiKey = viaSarvam ? process.env.SARVAM_API_KEY! : keyIndex ? p.backupKeys![Number(keyIndex) - 1] : p.apiKey;
  const baseUrl = viaSarvam ? SARVAM_URL : p.baseUrl;
  const sarvamAuth = viaSarvam || p.name === "sarvam";
  const signal = AbortSignal.timeout(req.timeoutMs ?? 20000);

  const res =
    p.name === "anthropic"
      ? await fetch(`${p.baseUrl}/messages`, {
          method: "POST",
          signal,
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model,
            max_tokens: req.maxTokens,
            temperature: req.temperature ?? 0.9,
            system: req.system,
            messages: [{ role: "user", content: req.user }],
            stream: true,
          }),
        })
      : await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          signal,
          headers: {
            "content-type": "application/json",
            ...(sarvamAuth ? { "api-subscription-key": apiKey } : { authorization: `Bearer ${apiKey}` }),
          },
          body: JSON.stringify({
            model,
            // Gemini 3 counts its thinking against max_tokens (3.5 Flash on "low" used ~570 of 600 and cut the
            // reply mid-sentence), so leave room for it; the visible length is set by the prompt.
            max_tokens: !viaSarvam && /^gemini-3/.test(model) ? req.maxTokens + 4096 : req.maxTokens,
            temperature: req.temperature ?? 0.9,
            stream: true,
            ...(req.json ? { response_format: { type: "json_object" } } : {}),
            // Lite models are fastest on their default thinking; forcing a level only slows them down.
            ...(req.reasoning && p.name === "gemini" && /^gemini-3/.test(model) && !/lite/.test(model)
              ? { reasoning_effort: req.reasoning }
              : {}),
            messages: [
              { role: "system", content: req.system },
              { role: "user", content: req.user },
            ],
          }),
        });

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    // Some models reject certain thinking levels; retry once with the model's default.
    if (res.status === 400 && req.reasoning && /thinking level|reasoning/i.test(body)) {
      yield* streamText({ ...req, reasoning: undefined });
      return;
    }
    // Overloaded, rate-limited or unavailable to this key: remember it and move to the next model in the chain.
    if ([401, 403, 404, 429, 500, 502, 503].includes(res.status)) {
      const lasting = (res.status === 429 && /quota/i.test(body)) || res.status < 429;
      markDown(slot, lasting ? 60 * 60_000 : 60_000);
      const chain = fullChain(p, req.model);
      const next = chain.slice(chain.indexOf(slot) + 1).find((m) => !isDown(m));
      if (next) {
        console.warn(`[llm] ${slot} returned ${res.status}; falling back to ${next}`);
        yield* streamText({ ...req, modelId: next });
        return;
      }
    }
    throw new Error(`${p.name} ${res.status}: ${body.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const evt = JSON.parse(data);
        const text =
          p.name === "anthropic"
            ? evt.type === "content_block_delta" && evt.delta?.type === "text_delta"
              ? evt.delta.text
              : ""
            : evt.choices?.[0]?.delta?.content ?? "";
        if (text) yield text;
      } catch {
        // ignore keep-alives / partial frames
      }
    }
  }
}

/** Non-streaming convenience wrapper. */
export async function completeText(req: LlmRequest): Promise<string> {
  let out = "";
  for await (const chunk of streamText(req)) out += chunk;
  return out;
}

/** Parses a JSON object out of an LLM reply (tolerates code fences / leading prose). */
export function parseJsonObject<T>(text: string): T {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("No JSON object in LLM reply");
  return JSON.parse(text.slice(start, end + 1)) as T;
}
