const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

export async function embedText(text: string): Promise<number[]> {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const apiKey = import.meta.env?.VITE_OPENAI_API_KEY as string | undefined;
  if (!apiKey) return [];

  const model = (import.meta.env?.VITE_OPENAI_EMBEDDING_MODEL as string | undefined) || DEFAULT_EMBEDDING_MODEL;
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      input: trimmed
    })
  });

  if (!response.ok) {
    return [];
  }

  const data = (await response.json()) as {
    data?: Array<{
      embedding?: number[];
    }>;
  };

  const embedding = data.data?.[0]?.embedding;
  return Array.isArray(embedding) ? embedding : [];
}
