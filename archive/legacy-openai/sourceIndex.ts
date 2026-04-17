import { embedText } from "./embeddings";
import { InMemoryVectorDBClient } from "./vectorStore";

export type StaticSourceType = "reddit" | "wiki" | "article";

export interface StaticSource {
  id: string;
  itemSlug: string;
  type: StaticSourceType;
  title: string;
  url: string;
  text: string;
  tags: string[];
}

const SOURCE_WEIGHTS: Record<StaticSourceType | "default", number> = {
  wiki: 3,
  article: 2,
  reddit: 1,
  default: 0
};

const SEMANTIC_QUERY_LIMIT = 12;

export const staticSources: StaticSource[] = [
  {
    id: "reddit_inception_ending_1",
    itemSlug: "inception",
    type: "reddit",
    title: "Inception ending and the spinning top debate",
    url: "https://reddit.com/r/movies/comments/inception-ending-debate",
    text:
      "Many viewers focus on the spinning top wobble, but Cobb walking away from the totem is treated as emotional closure over literal certainty.",
    tags: ["inception", "ending", "spinning top", "cobb", "totem"]
  },
  {
    id: "wiki_inception_1",
    itemSlug: "inception",
    type: "wiki",
    title: "Inception plot and themes summary",
    url: "https://example-wiki.org/inception",
    text:
      "Inception follows Dom Cobb through layered dream infiltration. Themes include guilt, memory, and uncertainty between reality and illusion.",
    tags: ["inception", "plot", "themes", "dream", "reality"]
  },
  {
    id: "article_inception_ending_1",
    itemSlug: "inception",
    type: "article",
    title: "Why Inception ends on ambiguity",
    url: "https://filmjournal.example.com/inception-ambiguity",
    text:
      "Critical readings describe the final cut as intentional ambiguity, prioritizing character resolution rather than proving objective reality.",
    tags: ["inception", "ending", "ambiguity", "analysis"]
  },
  {
    id: "reddit_interstellar_bookshelf_1",
    itemSlug: "interstellar",
    type: "reddit",
    title: "Bookshelf scene explained by fans",
    url: "https://reddit.com/r/interstellar/comments/bookshelf-scene-explained",
    text:
      "The bookshelf scene is often explained as Cooper communicating through gravity from a higher-dimensional tesseract to Murph.",
    tags: ["interstellar", "bookshelf", "cooper", "murph", "tesseract"]
  },
  {
    id: "wiki_interstellar_1",
    itemSlug: "interstellar",
    type: "wiki",
    title: "Interstellar story notes and scientific concepts",
    url: "https://example-wiki.org/interstellar",
    text:
      "Interstellar combines survival stakes with relativity and causal loops. The mission to find habitable worlds intersects with family sacrifice.",
    tags: ["interstellar", "plot", "wormhole", "time dilation", "causal loop"]
  },
  {
    id: "article_interstellar_time_1",
    itemSlug: "interstellar",
    type: "article",
    title: "Interstellar, causality, and emotional logic",
    url: "https://cinema-notes.example.com/interstellar-causality",
    text:
      "Analyses frame the film as a closed causal structure where scientific communication and emotional motivation coexist.",
    tags: ["interstellar", "bookshelf", "causality", "analysis"]
  },
  {
    id: "reddit_aot_ending_1",
    itemSlug: "attack-on-titan",
    type: "reddit",
    title: "Attack on Titan ending interpretation thread",
    url: "https://reddit.com/r/ShingekiNoKyojin/comments/aot-ending-interpretation",
    text:
      "Discussion centers on freedom, cycles of violence, and whether Eren's final choices break or continue inherited conflict.",
    tags: ["attack on titan", "aot", "eren", "ending", "freedom"]
  },
  {
    id: "wiki_aot_1",
    itemSlug: "attack-on-titan",
    type: "wiki",
    title: "Attack on Titan timeline and factions",
    url: "https://example-wiki.org/attack-on-titan",
    text:
      "The narrative shifts from survival horror to geopolitical conflict, examining propaganda, retaliation, and historical memory.",
    tags: ["attack on titan", "shingeki", "timeline", "war", "themes"]
  },
  {
    id: "reddit_jjk_binding_1",
    itemSlug: "jujutsu-kaisen",
    type: "reddit",
    title: "Cursed Binding Explained in JJK",
    url: "https://reddit.com/r/Jujutsushi/comments/cursed-binding-explained",
    text:
      "Cursed binding is a vow placed on a sorcerer that trades freedom for power under strict conditions and consequences.",
    tags: ["jjk", "jujutsu", "cursed binding", "binding vow", "sorcerer"]
  },
  {
    id: "wiki_jjk_1",
    itemSlug: "jujutsu-kaisen",
    type: "wiki",
    title: "Jujutsu Kaisen mechanics overview",
    url: "https://example-wiki.org/jujutsu-kaisen",
    text:
      "The system includes cursed energy manipulation, domain expansion, and binding vows that rebalance power through constraints.",
    tags: ["jjk", "jujutsu", "cursed energy", "binding vow"]
  }
];

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function tokenize(value: string) {
  return normalize(value)
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function uniqueTokens(value: string) {
  return Array.from(new Set(tokenize(value)));
}

function getSourceWeight(type: string) {
  return SOURCE_WEIGHTS[type as StaticSourceType] ?? SOURCE_WEIGHTS.default;
}

function canonicalSourceText(source: StaticSource) {
  return normalize(`${source.title} ${source.text}`);
}

function jaccardSimilarity(aTokens: string[], bTokens: string[]) {
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) {
      intersection += 1;
    }
  }
  const union = a.size + b.size - intersection;
  if (union === 0) return 1;
  return intersection / union;
}

function isRedundantSource(candidate: StaticSource, kept: StaticSource[]) {
  const candidateCanonical = canonicalSourceText(candidate);
  const candidateTokens = uniqueTokens(candidateCanonical);

  for (const existing of kept) {
    if (existing.id === candidate.id) continue;
    if (candidateCanonical === canonicalSourceText(existing)) {
      return true;
    }

    const sameItem = normalize(existing.itemSlug) === normalize(candidate.itemSlug);
    if (!sameItem) continue;

    const similarity = jaccardSimilarity(candidateTokens, uniqueTokens(canonicalSourceText(existing)));
    if (similarity >= 0.82) {
      return true;
    }
  }

  return false;
}

function scoreSource(source: StaticSource, question: string, item: string) {
  const normalizedQuestion = normalize(question);
  const keywords = tokenize(question);
  const searchable = normalize(`${source.title} ${source.text} ${source.tags.join(" ")}`);

  const weight = getSourceWeight(source.type);
  let score = weight * 4;
  for (const keyword of keywords) {
    if (searchable.includes(keyword)) {
      score += 2 + weight;
    }
  }

  for (const tag of source.tags) {
    if (normalizedQuestion.includes(normalize(tag))) {
      score += 3 + weight;
    }
  }

  if (item && normalize(source.itemSlug) === normalize(item)) {
    score += 6 + weight * 2;
  }

  if (normalizedQuestion.includes(source.type)) {
    score += 1;
  }

  return score;
}

export function retrieveStaticSources(question: string, item = "", limit = 6): StaticSource[] {
  const scored = staticSources
    .map((source) => ({
      source,
      score: scoreSource(source, question, item)
    }))
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        getSourceWeight(b.source.type) - getSourceWeight(a.source.type) ||
        a.source.id.localeCompare(b.source.id)
    );

  const deduped: StaticSource[] = [];
  for (const entry of scored) {
    if (isRedundantSource(entry.source, deduped)) {
      continue;
    }
    deduped.push(entry.source);
    if (deduped.length >= limit) {
      break;
    }
  }

  return deduped;
}

let semanticIndexPromise: Promise<InMemoryVectorDBClient<{ sourceId: string }>> | null = null;

function semanticSourceText(source: StaticSource) {
  return `${source.title}. ${source.text} ${source.tags.join(" ")}`.trim();
}

async function getSemanticIndex() {
  if (semanticIndexPromise) {
    return semanticIndexPromise;
  }

  semanticIndexPromise = (async () => {
    const client = new InMemoryVectorDBClient<{ sourceId: string }>();

    for (const source of staticSources) {
      const vector = await embedText(semanticSourceText(source));
      if (vector.length === 0) continue;
      client.upsert({
        id: source.id,
        vector,
        metadata: { sourceId: source.id }
      });
    }

    return client;
  })();

  return semanticIndexPromise;
}

function rerankSemanticResults(
  results: Array<{ source: StaticSource; semanticScore: number }>,
  item: string
) {
  return results.sort((a, b) => {
    const itemBoostA = item && normalize(a.source.itemSlug) === normalize(item) ? 0.25 : 0;
    const itemBoostB = item && normalize(b.source.itemSlug) === normalize(item) ? 0.25 : 0;
    const weightedA = a.semanticScore + getSourceWeight(a.source.type) * 0.08 + itemBoostA;
    const weightedB = b.semanticScore + getSourceWeight(b.source.type) * 0.08 + itemBoostB;
    return weightedB - weightedA || a.source.id.localeCompare(b.source.id);
  });
}

export async function retrieveSemanticSources(question: string, item = "", limit = 6): Promise<StaticSource[]> {
  const questionVector = await embedText(question);
  if (questionVector.length === 0) {
    return retrieveStaticSources(question, item, limit);
  }

  const client = await getSemanticIndex();
  const nearest = client.query(questionVector, SEMANTIC_QUERY_LIMIT);
  if (nearest.length === 0) {
    return retrieveStaticSources(question, item, limit);
  }

  const sourceById = new Map(staticSources.map((source) => [source.id, source]));
  const semanticMatches = nearest
    .map((entry) => {
      const source = sourceById.get(entry.id);
      if (!source) return null;
      return {
        source,
        semanticScore: entry.score
      };
    })
    .filter((entry): entry is { source: StaticSource; semanticScore: number } => Boolean(entry));

  const ranked = rerankSemanticResults(semanticMatches, item);
  const deduped: StaticSource[] = [];
  for (const entry of ranked) {
    if (isRedundantSource(entry.source, deduped)) {
      continue;
    }
    deduped.push(entry.source);
    if (deduped.length >= limit) {
      break;
    }
  }

  if (deduped.length === 0) {
    return retrieveStaticSources(question, item, limit);
  }

  return deduped;
}
