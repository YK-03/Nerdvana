export interface VectorRecord<TMetadata = Record<string, unknown>> {
  id: string;
  vector: number[];
  metadata: TMetadata;
}

export interface QueryResult<TMetadata = Record<string, unknown>> {
  id: string;
  score: number;
  metadata: TMetadata;
}

function cosineSimilarity(a: number[], b: number[]) {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class InMemoryVectorDBClient<TMetadata = Record<string, unknown>> {
  private records = new Map<string, VectorRecord<TMetadata>>();

  upsert(record: VectorRecord<TMetadata>) {
    this.records.set(record.id, record);
  }

  query(vector: number[], topK: number): QueryResult<TMetadata>[] {
    if (vector.length === 0 || topK <= 0) {
      return [];
    }

    const scored: QueryResult<TMetadata>[] = [];
    for (const record of this.records.values()) {
      const score = cosineSimilarity(vector, record.vector);
      scored.push({
        id: record.id,
        score,
        metadata: record.metadata
      });
    }

    return scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, topK);
  }
}
