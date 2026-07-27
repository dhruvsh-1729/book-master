type DeepSeekMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
export const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com";

export const hasDeepSeekKey = () => Boolean(process.env.DEEPSEEK_API_KEY);

export async function createDeepSeekJsonCompletion({
  messages,
  maxTokens = 1800,
  temperature = 0.2,
}: {
  messages: DeepSeekMessage[];
  maxTokens?: number;
  temperature?: number;
}) {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error("DEEPSEEK_API_KEY is not configured");
  }

  const response = await fetch(`${DEEPSEEK_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages,
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      temperature,
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`DeepSeek request failed (${response.status}): ${errorText.slice(0, 500)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("DeepSeek returned an empty response");
  }

  return {
    content,
    model: data?.model || DEEPSEEK_MODEL,
    usage: data?.usage || null,
  };
}

export function parseJsonObjectFromAi(content: string) {
  const trimmed = content.trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error("No JSON object found in AI response");
  }
  return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
}
