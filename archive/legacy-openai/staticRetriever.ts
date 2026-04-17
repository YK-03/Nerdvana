import { itemDocuments, type ItemDocument, type ItemDocumentSet } from "./itemDocuments";
import type { AnswerPoint, MockAnswer, Source } from "./mockAnswers";
import {
  retrieveSemanticSources,
  retrieveStaticSources,
  type StaticSource,
  type StaticSourceType
} from "./sourceIndex";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "to",
  "what",
  "when",
  "where",
  "why",
  "with"
]);

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function tokenize(value: string) {
  return normalizeText(value)
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function scoreDocument(doc: ItemDocument, normalizedQuestion: string, keywords: string[]) {
  const haystack = normalizeText(`${doc.source} ${doc.text}`);
  const overlap = keywords.reduce((count, keyword) => {
    return haystack.includes(keyword) ? count + 1 : count;
  }, 0);
  const phraseBonus = normalizedQuestion && haystack.includes(normalizedQuestion) ? 2 : 0;
  return overlap + phraseBonus;
}

function rankDocuments(itemSet: ItemDocumentSet, question: string) {
  return rankDocumentsFromList(itemSet.documents, question);
}

function rankDocumentsFromList(documents: ItemDocument[], question: string) {
  const normalizedQuestion = normalizeText(question);
  const keywords = tokenize(question);

  const scored = documents
    .map((doc) => ({
      doc,
      score: scoreDocument(doc, normalizedQuestion, keywords)
    }))
    .sort((a, b) => b.score - a.score || a.doc.source.localeCompare(b.doc.source));

  const withHits = scored.filter((entry) => entry.score > 0);
  const picked = withHits.length > 0 ? withHits : scored.slice(0, Math.min(2, scored.length));
  return picked.map((entry) => entry.doc);
}

function docsFromRetrievedSources(retrieved: StaticSource[]): ItemDocument[] {
  const grouped = new Map<string, string[]>();
  for (const source of retrieved) {
    const existing = grouped.get(source.type) ?? [];
    existing.push(`${source.title}. ${source.text}`);
    grouped.set(source.type, existing);
  }

  return Array.from(grouped.entries()).map(([type, texts]) => ({
    source: type,
    text: texts.join(" ")
  }));
}

function groupSourcesByType(retrieved: StaticSource[]): Map<StaticSourceType, Source[]> {
  const grouped = new Map<StaticSourceType, Source[]>();
  for (const source of retrieved) {
    const existing = grouped.get(source.type) ?? [];
    if (existing.some((entry) => entry.url === source.url)) {
      continue;
    }

    existing.push({
      title: source.title,
      url: source.url,
      type: source.type,
      text: source.text
    });
    grouped.set(source.type, existing);
  }

  return grouped;
}

function extractPoints(text: string) {
  return text
    .split(/[.!?]+/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);
}

function toPoint(text: string, source?: string): AnswerPoint {
  return {
    text: text.trim(),
    source: source?.trim() || undefined
  };
}

function formatSourceTitle(source: string) {
  return source.replace(/[_-]+/g, " ").toUpperCase();
}

function truncateSentence(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function extractiveSummary(chunks: string[], maxLength = 240) {
  const first = chunks.join(" ").trim();
  return truncateSentence(first, maxLength);
}

function buildFallbackCategorySummary(category: string, chunks: string[]) {
  const pointTexts = chunks
    .flatMap((chunk) => extractPoints(chunk))
    .map((point) => truncateSentence(point, 140));

  const uniquePointTexts = Array.from(new Set(pointTexts)).slice(0, 5);
  while (uniquePointTexts.length < 3) {
    uniquePointTexts.push(
      uniquePointTexts.length === 0
        ? `No strong evidence found for ${category}.`
        : uniquePointTexts.length === 1
          ? "Try asking with a more specific question."
          : "Use item-specific terms to improve retrieval."
    );
  }

  return {
    summary: extractiveSummary(chunks),
    points: uniquePointTexts.map((text) => toPoint(text, category))
  };
}

type SummarizeResult = {
  summary: string;
  points: AnswerPoint[];
};

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate) as Partial<SummarizeResult>;
  } catch {
    return null;
  }
}

export async function summarizeChunksMulti(
  category: string,
  question: string,
  chunks: string[]
): Promise<SummarizeResult> {
  const normalizedChunks = chunks.map((chunk) => chunk.trim()).filter(Boolean);
  if (normalizedChunks.length === 0) {
    return buildFallbackCategorySummary(category, []);
  }

  const apiKey = import.meta.env?.VITE_OPENAI_API_KEY as string | undefined;
  if (!apiKey) {
    return buildFallbackCategorySummary(category, normalizedChunks);
  }

  try {
    const model = (import.meta.env?.VITE_OPENAI_MODEL as string | undefined) || "gpt-4.1-mini";
    const prompt = [
      "You are a retrieval summarizer for Nerdvana.",
      "Return only strict JSON with keys: summary (string), points (array of objects).",
      "Rules:",
      "- Use only the provided chunks. Do not add facts.",
      "- Keep summary <= 2 sentences.",
      "- Return 3 to 5 distinct bullet points in points.",
      "- Each bullet must represent a different fact or angle from the chunks.",
      "- Keep each bullet concise and evidence-grounded.",
      "- Each bullet object must be: {\"text\": \"...\", \"source\": \"...\"}.",
      `- Source must be one of: ${category}.`,
      `Category: ${category}`,
      `Question: ${question}`,
      "Chunks:",
      ...normalizedChunks.map((chunk, index) => `[${index + 1}] ${chunk}`)
    ].join("\n");

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        input: prompt
      })
    });

    if (!response.ok) {
      return buildFallbackCategorySummary(category, normalizedChunks);
    }

    const data = (await response.json()) as {
      output_text?: string;
    };

    const raw = data.output_text?.trim();
    if (!raw) {
      return buildFallbackCategorySummary(category, normalizedChunks);
    }

    const parsed = parseJsonObject(raw);
    if (!parsed) {
      return buildFallbackCategorySummary(category, normalizedChunks);
    }

    const summary = typeof parsed.summary === "string" ? truncateSentence(parsed.summary.trim(), 280) : "";
    const points = Array.isArray(parsed.points)
      ? parsed.points
          .map((item) => {
            if (typeof item === "string") {
              return toPoint(truncateSentence(item.trim(), 160), category);
            }
            if (item && typeof item === "object") {
              const text = "text" in item && typeof item.text === "string" ? item.text.trim() : "";
              const source = "source" in item && typeof item.source === "string" ? item.source.trim() : category;
              if (!text) return null;
              return toPoint(truncateSentence(text, 160), source || category);
            }
            return null;
          })
          .filter((item): item is AnswerPoint => Boolean(item?.text))
          .slice(0, 5)
      : [];

    if (!summary || points.length < 3) {
      return buildFallbackCategorySummary(category, normalizedChunks);
    }

    return {
      summary,
      points
    };
  } catch {
    return buildFallbackCategorySummary(category, normalizedChunks);
  }
}

export async function summarizeChunks(
  category: string,
  question: string,
  chunks: string[]
): Promise<SummarizeResult> {
  return summarizeChunksMulti(category, question, chunks);
}

function fallbackAnswer(question: string, item: string): MockAnswer {
  const context = item ? ` for item "${item}"` : "";
  return {
    summary: `No matching static documents were found${context}. Ask a more specific question to improve keyword retrieval.`,
    categories: [
      {
        id: "retrieval_status",
        title: "RETRIEVAL STATUS",
        description: "Static keyword retrieval checks question tokens against item documents.",
        points: [
          `Question: "${question || "empty"}"`,
          item
            ? `Context item "${item}" has no indexed documents.`
            : "No item context provided in query parameter 'item'."
        ]
      }
    ],
    spoilers: "No spoiler excerpt available because retrieval did not return relevant chunks."
  };
}

export function resolveStaticAnswer(question: string, item: string): MockAnswer {
  const normalizedQuestion = question.trim();
  const normalizedItem = normalizeText(item);
  const itemSet = normalizedItem ? itemDocuments[normalizedItem] : undefined;
  const retrievedSources = retrieveStaticSources(normalizedQuestion, normalizedItem);
  const sourceDocs = docsFromRetrievedSources(retrievedSources);
  const sourceMapByType = groupSourcesByType(retrievedSources);
  const baseDocs = sourceDocs.length > 0 ? sourceDocs : itemSet?.documents ?? [];

  if (!normalizedQuestion || baseDocs.length === 0) {
    return fallbackAnswer(normalizedQuestion, normalizedItem);
  }

  const selectedDocs = rankDocumentsFromList(baseDocs, normalizedQuestion);
  if (selectedDocs.length === 0) {
    return fallbackAnswer(normalizedQuestion, normalizedItem);
  }

  const topDoc = selectedDocs[0];
  const spoilerDoc =
    selectedDocs.find((doc) => /ending|bookshelf|twist|finale|spoiler/i.test(doc.source)) ?? topDoc;

  return {
    summary: topDoc.text,
    categories: selectedDocs.map((doc) => ({
      id: `source_${doc.source}`,
      title: formatSourceTitle(doc.source),
      description: `Retrieved from static sources for ${normalizedItem || "query context"}.`,
      points: extractPoints(doc.text).map((point) => toPoint(point, doc.source)),
      sources: sourceMapByType.get(doc.source as StaticSourceType) ?? []
    })),
    spoilers: spoilerDoc.text
  };
}

export async function resolveStaticAnswerWithAISummary(
  question: string,
  item: string,
  _input?: { snippets?: string }
): Promise<MockAnswer> {
  const normalizedQuestion = question.trim();
  const normalizedItem = normalizeText(item);
  const itemSet = normalizedItem ? itemDocuments[normalizedItem] : undefined;
  const retrievedSources = await retrieveSemanticSources(normalizedQuestion, normalizedItem);
  const sourceDocs = docsFromRetrievedSources(retrievedSources);
  const sourceMapByType = groupSourcesByType(retrievedSources);
  const baseDocs = sourceDocs.length > 0 ? sourceDocs : itemSet?.documents ?? [];

  if (!normalizedQuestion || baseDocs.length === 0) {
    return fallbackAnswer(normalizedQuestion, normalizedItem);
  }

  const selectedDocs = rankDocumentsFromList(baseDocs, normalizedQuestion);
  if (selectedDocs.length === 0) {
    return fallbackAnswer(normalizedQuestion, normalizedItem);
  }

  const summarizedCategories = await Promise.all(
    selectedDocs.map(async (doc) => {
      const result = await summarizeChunksMulti(doc.source, normalizedQuestion, [doc.text]);
      return {
        id: `source_${doc.source}`,
        title: formatSourceTitle(doc.source),
        description: `Retrieved from static sources for ${normalizedItem || "query context"}.`,
        points: result.points,
        summary: result.summary,
        sources: sourceMapByType.get(doc.source as StaticSourceType) ?? []
      };
    })
  );

  const spoilerDoc =
    selectedDocs.find((doc) => /ending|bookshelf|twist|finale|spoiler/i.test(doc.source)) ??
    selectedDocs[0];
  const spoilerSummary = await summarizeChunks("spoilers", normalizedQuestion, [spoilerDoc.text]);

  return {
    summary: summarizedCategories[0]?.summary ?? extractiveSummary([selectedDocs[0].text]),
    categories: summarizedCategories.map(({ summary: _summary, ...category }) => category),
    spoilers: spoilerSummary.summary
  };
}
