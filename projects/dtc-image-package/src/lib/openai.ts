// OpenAI vision client (browser).
// Used only for the gpt-4o scene-analysis step. All image generation is via Runflow.

const OPENAI_BASE = "https://api.openai.com/v1";

export class OpenAIError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = "OpenAIError";
  }
}

export async function chat(body: Record<string, unknown>, apiKey: string): Promise<any> {
  const res = await fetch(`${OPENAI_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new OpenAIError(`OpenAI -> ${res.status}: ${t.slice(0, 400)}`, res.status);
  }
  return res.json();
}
