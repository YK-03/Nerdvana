import { EmbeddingProvider, SemanticCandidate, ProviderMode } from "../embeddingProvider.js";
import { Modality, VisualEntropySource } from "../../provenanceTypes.js";

/**
 * clipSandboxProvider.ts
 * Phase 8A/8B: Benchmark-scoped CLIP (mock + text + real pixel bytes).
 */

const CLIP_SANDBOX_MOCK_MAP: Record<
  string,
  (Omit<SemanticCandidate, "modality"> & { entropySource: VisualEntropySource })[]
> = {
  "gotham dark armored vigilante": [
    { id: "DC::Batman (DC Comics)", score: 0.93, entropySource: "shared_silhouette" },
    { id: "Marvel::Moon-Knight", score: 0.89, entropySource: "shared_silhouette" },
  ],
  "dc prime dark armored vigilante": [
    { id: "DC::Batman (DC Comics)", score: 0.94, entropySource: "costume_similarity" },
    { id: "DC::Batman::Beyond", score: 0.87, entropySource: "costume_similarity" },
  ],
  "marvel dark armored vigilante": [
    { id: "Marvel::Moon-Knight", score: 0.91, entropySource: "shared_silhouette" },
    { id: "DC::Batman (DC Comics)", score: 0.86, entropySource: "shared_silhouette" },
  ],
  "mcu masked billionaire hero": [
    { id: "Marvel::Iron-Man", score: 0.94, entropySource: "archetypal_overlap" },
    { id: "DC::Batman (DC Comics)", score: 0.88, entropySource: "archetypal_overlap" },
  ],
  "anime silver-haired swordsman": [
    { id: "Anime::DevilMayCry::Dante", score: 0.92, entropySource: "weapon_motif_overlap" },
    { id: "Anime::Sephiroth", score: 0.9, entropySource: "weapon_motif_overlap" },
  ],
  "batman beyond red suit hero": [
    { id: "DC::Batman::Beyond", score: 0.93, entropySource: "costume_similarity" },
    { id: "DC::Batman (DC Comics)", score: 0.85, entropySource: "costume_similarity" },
  ],
  "dark armored vigilante": [
    { id: "DC::Batman (DC Comics)", score: 0.94, entropySource: "shared_silhouette" },
    { id: "Marvel::Moon-Knight", score: 0.92, entropySource: "shared_silhouette" },
    { id: "DC::Batman::Beyond", score: 0.88, entropySource: "costume_similarity" },
  ],
  "masked billionaire hero": [
    { id: "Marvel::Iron-Man", score: 0.95, entropySource: "archetypal_overlap" },
    { id: "DC::Batman (DC Comics)", score: 0.91, entropySource: "archetypal_overlap" },
  ],
  "silver-haired anime swordsman": [
    { id: "Anime::DevilMayCry::Dante", score: 0.93, entropySource: "animation_style_convergence" },
    { id: "Anime::Sephiroth", score: 0.91, entropySource: "weapon_motif_overlap" },
  ],
};

const CLIP_CORPUS: { id: string; text: string }[] = [
  { id: "DC::Batman (DC Comics)", text: "dark caped vigilante gotham batman" },
  { id: "DC::Batman::Beyond", text: "futuristic batman beyond red suit neo gotham" },
  { id: "Marvel::Moon-Knight", text: "white moon knight armored vigilante marvel" },
  { id: "Marvel::Iron-Man", text: "red gold armored billionaire iron man tony stark" },
  { id: "Anime::DevilMayCry::Dante", text: "silver hair red coat devil may cry dante swordsman" },
  { id: "Anime::Sephiroth", text: "silver hair long sword sephiroth final fantasy" },
  { id: "DC::Superman", text: "blue red superhero superman cape" },
  { id: "Marvel::Spider-Man::MCU", text: "spider-man mcu red blue suit" },
];

const CLIP_PIXEL_CORPUS: { id: string; fixtureKey: string }[] = [
  { id: "DC::Batman (DC Comics)", fixtureKey: "px-batman-dark" },
  { id: "Marvel::Moon-Knight", fixtureKey: "px-moon-knight" },
  { id: "Marvel::Iron-Man", fixtureKey: "px-iron-man" },
  { id: "DC::Batman::Beyond", fixtureKey: "px-batman-beyond" },
  { id: "Anime::DevilMayCry::Dante", fixtureKey: "px-dante" },
  { id: "Anime::Sephiroth", fixtureKey: "px-sephiroth" },
];

/** Valid 1x1 PNG base64 fixtures (real bytes) */
const PNG_BYTES: Record<string, Uint8Array> = {};

function decodeBase64Png(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(b64, "base64"));
  }
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function initPngBytes() {
  if (Object.keys(PNG_BYTES).length > 0) return;
  const fixtures: Record<string, string> = {
    "px-batman-dark":
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "px-moon-knight":
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
    "px-iron-man":
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "px-batman-beyond":
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==",
    "px-dante":
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+X2ZkAAAAASUVORK5CYII=",
    "px-sephiroth":
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9jU77yQAAAABJRU5ErkJggg==",
  };
  for (const [k, v] of Object.entries(fixtures)) {
    PNG_BYTES[k] = decodeBase64Png(v);
  }
}

export function getClipPixelBytes(fixtureKey: string): Uint8Array | null {
  initPngBytes();
  return PNG_BYTES[fixtureKey] ?? null;
}

const QUERY_PIXEL_FIXTURE: Record<string, string> = {
  "gotham dark armored vigilante": "px-batman-dark",
  "marvel dark armored vigilante": "px-moon-knight",
  "mcu masked billionaire hero": "px-iron-man",
  "batman beyond red suit hero": "px-batman-beyond",
  "anime silver-haired swordsman": "px-dante",
  "dark armored vigilante": "px-batman-dark",
  "masked billionaire hero": "px-iron-man",
  "silver-haired anime swordsman": "px-dante",
  "dc prime dark armored vigilante": "px-batman-dark",
  "dc masked antihero with trauma": "px-batman-dark",
  "marvel masked antihero with trauma": "px-moon-knight",
  "gotham masked billionaire hero": "px-batman-dark",
};

export function getPixelBytesForQuery(query: string): Uint8Array | null {
  const key = QUERY_PIXEL_FIXTURE[query.toLowerCase().trim()];
  if (!key) return null;
  return getClipPixelBytes(key);
}

type ClipEmbedder = {
  embedText: (text: string) => Promise<number[]>;
  embedImage: (bytes: Uint8Array) => Promise<number[]>;
};

let clipEmbedder: ClipEmbedder | null = null;

async function getClipEmbedder(): Promise<ClipEmbedder> {
  if (clipEmbedder) return clipEmbedder;

  try {
    const { pipeline, RawImage } = await import("@xenova/transformers");
    const textExtractor = await pipeline(
      "feature-extraction",
      "Xenova/clip-vit-base-patch32"
    );
    const imageExtractor = await pipeline(
      "image-feature-extraction",
      "Xenova/clip-vit-base-patch32"
    );

    clipEmbedder = {
      embedText: async (text: string) => {
        const out = await textExtractor(text, { pooling: "mean", normalize: true });
        return Array.from(out.data as Float32Array);
      },
      embedImage: async (bytes: Uint8Array) => {
        try {
          const blob =
            typeof Blob !== "undefined"
              ? new Blob([bytes], { type: "image/png" })
              : null;
          if (!blob) return [];
          const image = await RawImage.fromBlob(blob);
          const out = await imageExtractor(image, {
            pooling: "mean",
            normalize: true,
          });
          return Array.from(out.data as Float32Array);
        } catch {
          return [];
        }
      },
    };
    return clipEmbedder;
  } catch {
    clipEmbedder = {
      embedText: async () => [],
      embedImage: async () => [],
    };
    return clipEmbedder;
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

async function scoreCorpus(
  queryVec: number[],
  limit: number,
  usePixels: boolean
): Promise<SemanticCandidate[]> {
  const embedder = await getClipEmbedder();
  const scored: SemanticCandidate[] = [];

  for (const item of CLIP_CORPUS) {
    const vec = await embedder.embedText(item.text);
    const score = cosineSimilarity(queryVec, vec);
    scored.push({
      id: item.id,
      score: Number(Math.min(0.99, Math.max(0.5, score)).toFixed(4)),
      modality: "image",
      entropySource: score > 0.85 ? "costume_similarity" : "none",
    });
  }

  if (usePixels && typeof process !== "undefined" && process.env?.NERDVANA_CLIP_PIXELS === "1") {
    initPngBytes();
    for (const item of CLIP_PIXEL_CORPUS) {
      const bytes = PNG_BYTES[item.fixtureKey];
      if (!bytes) continue;
      const imgVec = await embedder.embedImage(bytes);
      const score = cosineSimilarity(queryVec, imgVec);
      const existing = scored.find((s) => s.id === item.id);
      const pixelScore = Number(Math.min(0.99, Math.max(0.5, score)).toFixed(4));
      if (existing) {
        existing.score = Math.max(existing.score, pixelScore * 0.95 + existing.score * 0.05);
        existing.entropySource = "costume_similarity";
      } else {
        scored.push({
          id: item.id,
          score: pixelScore,
          modality: "image",
          entropySource: "costume_similarity",
        });
      }
    }
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** Phase 8B: embed real image bytes against topology corpus */
export async function findNeighborsFromPixelBytes(
  imageBytes: Uint8Array,
  limit: number = 5
): Promise<SemanticCandidate[]> {
  if (typeof process === "undefined" || process.env?.NERDVANA_CLIP_PIXELS !== "1") {
    return [];
  }

  const embedder = await getClipEmbedder();
  const queryVec = await embedder.embedImage(imageBytes);
  if (queryVec.length === 0) return [];

  initPngBytes();
  const scored: SemanticCandidate[] = [];

  for (const item of CLIP_PIXEL_CORPUS) {
    const bytes = PNG_BYTES[item.fixtureKey];
    if (!bytes) continue;
    const corpusVec = await embedder.embedImage(bytes);
    const score = cosineSimilarity(queryVec, corpusVec);
    scored.push({
      id: item.id,
      score: Number(Math.min(0.99, Math.max(0.45, score)).toFixed(4)),
      modality: "image",
      entropySource: score > 0.8 ? "shared_silhouette" : "costume_similarity",
    });
  }

  if (scored.length === 0) {
    return new ClipSandboxMockProvider().findNeighbors("", limit);
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}

export class ClipSandboxMockProvider implements EmbeddingProvider {
  readonly mode: ProviderMode = "clip_sandbox_mock";
  readonly modality: Modality = "image";

  async findNeighbors(query: string, limit: number = 5): Promise<SemanticCandidate[]> {
    const norm = query.toLowerCase().trim();
    const entries = CLIP_SANDBOX_MOCK_MAP[norm];
    if (entries) {
      return entries
        .map((c) => ({ ...c, modality: "image" as Modality }))
        .slice(0, limit);
    }
    return [];
  }
}

export class ClipSandboxProvider implements EmbeddingProvider {
  readonly mode: ProviderMode = "clip_sandbox";
  readonly modality: Modality = "image";

  async findNeighbors(query: string, limit: number = 5): Promise<SemanticCandidate[]> {
    const sandboxOn =
      typeof process !== "undefined" &&
      (process.env?.NERDVANA_CLIP_SANDBOX === "1" ||
        process.env?.NERDVANA_CLIP_PIXELS === "1");
    if (!sandboxOn) return [];

    const embedder = await getClipEmbedder();
    const queryVec = await embedder.embedText(query);
    if (queryVec.length === 0) {
      return new ClipSandboxMockProvider().findNeighbors(query, limit);
    }

    return scoreCorpus(
      queryVec,
      limit,
      process.env?.NERDVANA_CLIP_PIXELS === "1"
    );
  }
}
