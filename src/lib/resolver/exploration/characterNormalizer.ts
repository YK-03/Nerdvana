import { type Character } from "../../explorationTypes.js";

const GENERIC_ROLE_BLOCKLIST = [
  /^(uncredited)$/i,
  /^(waiter|waitress|cop\s*\#?\d*|police\s*officer|security\s*guard|doctor|nurse|paramedic|thug\s*\#?\d*|henchman|goon|extra)$/i,
  /^(student|teacher|townsperson|villager|soldier|guard|bartender|receptionist|news\s*anchor|reporter)$/i,
  /^(himself|herself|narrator|announcer)$/i
];

export function normalizeCharacters(characters: Character[]): Character[] {
  const normalized: Character[] = [];
  const seenNames = new Set<string>();

  for (const char of characters) {
    if (!char.name) continue;

    // Remove text in parentheses like "Tyler Durden (uncredited)"
    let cleanName = char.name.replace(/\s*\([^)]*\)\s*/g, '').trim();
    if (!cleanName) continue;

    // Filter against generic role blocklist
    const isGeneric = GENERIC_ROLE_BLOCKLIST.some((pattern) => pattern.test(cleanName));
    if (isGeneric) continue;

    // Deduplicate by clean name
    const nameLower = cleanName.toLowerCase();
    if (seenNames.has(nameLower)) continue;
    seenNames.add(nameLower);

    normalized.push({
      ...char,
      name: cleanName
    });
  }

  // Slice to top 8 characters for a premium, curated experience
  return normalized.slice(0, 8);
}
