// Server-only LLM access. Picks a provider from env; "mock" when no key is configured.
//
//   GEMINI_API_KEY      -> Gemini via its OpenAI-compatible endpoint (free tier works)
//   ANTHROPIC_API_KEY   -> Claude
//   LLM_BASE_URL + LLM_API_KEY -> any OpenAI-compatible API (Groq, OpenRouter, Ollama, OpenAI)
//   LLM_PROVIDER=mock   -> force the offline mock (used by e2e tests)
//   LLM_MODEL_FAST / LLM_MODEL_SMART override the default models.

export type ProviderName = "gemini" | "anthropic" | "openai-compatible" | "mock";

interface Provider {
  name: ProviderName;
  baseUrl: string;
  apiKey: string;
  fast: string;
  smart: string;
}

export function getProvider(): Provider {
  const env = process.env;
  const forced = env.LLM_PROVIDER;
  const fastOverride = env.LLM_MODEL_FAST;
  const smartOverride = env.LLM_MODEL_SMART;
  if (forced === "mock") return { name: "mock", baseUrl: "", apiKey: "", fast: "mock", smart: "mock" };
  if ((forced === "gemini" || !forced) && env.GEMINI_API_KEY) {
    return {
      name: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: env.GEMINI_API_KEY,
      fast: fastOverride || "gemini-2.5-flash-lite",
      smart: smartOverride || "gemini-2.5-flash",
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

export interface LlmRequest {
  system: string;
  user: string;
  model: "fast" | "smart";
  maxTokens: number;
  temperature?: number;
  json?: boolean;
  timeoutMs?: number;
}

/** Streams text deltas. Throws on HTTP/network errors. Not for the mock provider. */
export async function* streamText(req: LlmRequest): AsyncGenerator<string> {
  const p = getProvider();
  if (p.name === "mock") throw new Error("streamText called with mock provider");
  const model = req.model === "fast" ? p.fast : p.smart;
  const signal = AbortSignal.timeout(req.timeoutMs ?? 20000);

  const res =
    p.name === "anthropic"
      ? await fetch(`${p.baseUrl}/messages`, {
          method: "POST",
          signal,
          headers: {
            "content-type": "application/json",
            "x-api-key": p.apiKey,
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
      : await fetch(`${p.baseUrl}/chat/completions`, {
          method: "POST",
          signal,
          headers: { "content-type": "application/json", authorization: `Bearer ${p.apiKey}` },
          body: JSON.stringify({
            model,
            max_tokens: req.maxTokens,
            temperature: req.temperature ?? 0.9,
            stream: true,
            ...(req.json ? { response_format: { type: "json_object" } } : {}),
            messages: [
              { role: "system", content: req.system },
              { role: "user", content: req.user },
            ],
          }),
        });

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
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
