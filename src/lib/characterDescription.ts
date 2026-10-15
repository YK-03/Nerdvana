export interface CharacterDescriptionContent {
  summary: string | null;
  attributes: Array<{ label: string; value: string }>;
}

const MARKDOWN_LABEL_PATTERN = /(?:\*\*|__)([^*_\n:]{1,40}):(?:\*\*|__)/g;
const LABEL_PATTERN = /^\s*(?:[-•]\s*)?([A-Za-z][A-Za-z0-9 /&'’.-]{0,39})\s*:\s*(.+?)\s*$/;

function cleanText(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/~!/g, "")
    .replace(/!~/g, "")
    .replace(/\*\*|__/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Converts provider descriptions into safe plain text and structured fields.
 * It intentionally returns text only; no provider markup is rendered as HTML.
 */
export function formatCharacterDescription(description?: string | null): CharacterDescriptionContent {
  if (typeof description !== "string" || !description.trim()) {
    return { summary: null, attributes: [] };
  }

  const withLineBreaks = description
    .replace(/<br\s*\/?>(?=\s*)/gi, "\n")
    .replace(MARKDOWN_LABEL_PATTERN, "\n$1:");

  const proseBlocks: string[] = [];
  let currentProse: string[] = [];
  const attributes: Array<{ label: string; value: string }> = [];
  const seenLabels = new Set<string>();

  const flushProse = () => {
    if (currentProse.length > 0) {
      proseBlocks.push(currentProse.join(" ").trim());
      currentProse = [];
    }
  };

  for (const rawLine of withLineBreaks.split(/\r?\n/)) {
    const line = cleanText(rawLine);
    if (!line) {
      flushProse();
      continue;
    }

    const match = line.match(LABEL_PATTERN);
    if (!match) {
      currentProse.push(line);
      continue;
    }

    flushProse();

    const label = cleanText(match[1]);
    const value = cleanText(match[2]);
    if (!label || !value) continue;

    const labelKey = label.toLowerCase();
    if (seenLabels.has(labelKey)) continue;
    seenLabels.add(labelKey);
    attributes.push({ label, value });
  }

  flushProse();
  const summary = proseBlocks.join("\n\n").trim() || null;
  return { summary, attributes };
}

export function getCharacterDetailContent(
  description: string | null | undefined,
  spoilerMode: boolean,
  mediaLens?: string | null,
  revealAnimeSpoiler = false,
): CharacterDescriptionContent {
  const isAnime = mediaLens?.toLowerCase() === "anime";
  if (!spoilerMode && (!isAnime || !revealAnimeSpoiler)) return { summary: null, attributes: [] };
  return formatCharacterDescription(description);
}
