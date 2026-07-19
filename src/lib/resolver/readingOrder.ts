import { continuityGraphInstance, type ContinuityNode } from "./continuityGraph.js";
import { cleanAlphanumeric } from "./queryNormalizer.js";

export interface ReadingOrderItem {
  title: string;
  providerId?: string;
  type: "issue" | "volume" | "event";
  issueNumber?: string;
  year?: number;
  reason?: string;
}

export interface ContinuationSuggestionItem {
  title: string;
  providerId?: string;
  type: "issue" | "volume" | "event";
  reason?: string;
}

const MAX_READING_ORDER_ITEMS = 10;

// Curated landmarks sequences (isolated, minimal, and high-confidence)
const CURATED_READING_ORDERS: Record<string, ReadingOrderItem[]> = {
  "batmanyearone": [
    { title: "Batman: Year One", type: "volume", year: 1987, reason: "Canonical starting point of Batman's modern career." },
    { title: "Batman: The Long Halloween", type: "volume", year: 1996, reason: "Classic early-career mystery sequel to Year One." },
    { title: "Batman: Dark Victory", type: "volume", year: 1999, reason: "Direct sequel to The Long Halloween introducing Robin." },
    { title: "Robin: Year One", type: "volume", year: 2000, reason: "Early career progression of Robin as Batman's sidekick." }
  ],
  "civilwar": [
    { title: "Civil War #1", type: "issue", issueNumber: "1", year: 2006, reason: "The conflict begins over the Superhero Registration Act." },
    { title: "Civil War #2", type: "issue", issueNumber: "2", year: 2006, reason: "Iron Man and Captain America recruit opposing forces." },
    { title: "Civil War #3", type: "issue", issueNumber: "3", year: 2006, reason: "Spider-Man unmasks to the world." },
    { title: "Civil War #4", type: "issue", issueNumber: "4", year: 2006, reason: "Clones and casualties escalate the war." },
    { title: "Civil War #5", type: "issue", issueNumber: "5", year: 2006, reason: "A major team shift changes the balance." },
    { title: "Civil War #6", type: "issue", issueNumber: "6", year: 2006, reason: "Forces prepare for the final showdown." },
    { title: "Civil War #7", type: "issue", issueNumber: "7", year: 2006, reason: "The dramatic climax and aftermath." },
    { title: "Civil War: Front Line", type: "volume", year: 2006, reason: "Essential tie-in detailing the public and media perspective." }
  ],
  "kingdomcome": [
    { title: "Kingdom Come", type: "volume", year: 1996, reason: "The iconic Elseworlds clash between classic and new-generation heroes." },
    { title: "The Kingdom", type: "volume", year: 1999, reason: "The direct thematic sequel exploring Hypertime and the aftermath." }
  ],
  "ultimatespiderman": [
    { title: "Ultimate Spider-Man", type: "volume", year: 2000, reason: "The absolute beginning of Peter Parker in the Ultimate Universe (Earth-1610)." },
    { title: "Ultimate Comics Spider-Man", type: "volume", year: 2009, reason: "The next era of Peter Parker's adventures in Earth-1610." },
    { title: "Ultimate Comics All-New Spider-Man", type: "volume", year: 2011, reason: "The legendary introduction of Miles Morales as the new Spider-Man." }
  ]
};

const CURATED_CONTINUATION_SUGGESTIONS: Record<string, ContinuationSuggestionItem[]> = {
  "batmanyearone": [
    { title: "Batman: The Long Halloween", type: "volume", reason: "Direct sequel storyline set in the same early-career era." },
    { title: "Robin: Year One", type: "volume", reason: "Direct continuity continuation focused on Robin's training." }
  ],
  "civilwar": [
    { title: "Secret Invasion", type: "event", reason: "The next major Marvel crossover event emerging directly from the fallout of Civil War." }
  ],
  "kingdomcome": [
    { title: "The Kingdom", type: "volume", reason: "Direct Elseworld sequel exploring hypertime and the legacy of the original clash." }
  ],
  "ultimatespiderman": [
    { title: "Ultimate Comics Spider-Man", type: "volume", reason: "Sequel volume tracking Peter Parker's ultimate evolution." },
    { title: "Ultimate Comics All-New Spider-Man", type: "volume", reason: "The direct sequel volume introducing Miles Morales." }
  ]
};

// Conservative, lightweight spoiler keywords
const SPOILER_KEYWORDS = [
  "death",
  "dies",
  "dead",
  "ending",
  "kills",
  "killed",
  "final battle",
  "reboot",
  "timeline collapse",
  "final chapter",
  "doom",
  "extinction",
  "destroys",
  "destroyed"
];

function applySpoilerFilter(title: string): boolean {
  const normTitle = title.toLowerCase();
  const matched = SPOILER_KEYWORDS.some(kw => normTitle.includes(kw));
  if (matched) {
    console.log(`[SPOILER_SAFE_FILTER] Filtered candidate "${title}" due to spoiler keywords.`);
  }
  return !matched;
}

export function buildReadingOrder(providerId: string, canonicalTitle: string): ReadingOrderItem[] {
  const normKey = cleanAlphanumeric(canonicalTitle);

  // 1. Curated Sequences (Landmark runs stay isolated & high confidence)
  if (CURATED_READING_ORDERS[normKey]) {
    console.log(`[READING_ORDER_CREATED] Curated sequencing locked for "${canonicalTitle}" with ${CURATED_READING_ORDERS[normKey].length} items.`);
    return CURATED_READING_ORDERS[normKey];
  }

  // 2. Provider-native and typed neighbor extraction
  console.log(`[READING_ORDER_CREATED] Generating dynamic timeline for "${canonicalTitle}" (${providerId})`);
  const neighbors = continuityGraphInstance.getNeighbors(providerId);
  const items: ReadingOrderItem[] = [];

  // Add the source node itself first
  const selfNode = continuityGraphInstance.getNode(providerId);
  if (selfNode) {
    const isIssue = selfNode.providerType === "issue";
    items.push({
      title: selfNode.canonicalTitle,
      providerId: selfNode.providerId,
      type: isIssue ? "issue" : (selfNode.providerType === "event" ? "event" : "volume"),
      year: selfNode.continuity ? parseInt(selfNode.continuity) : undefined,
      reason: `Primary active selection.`
    });
  }

  const seenTitles = new Set([canonicalTitle.toLowerCase()]);

  // Priority 1: Provider-native issue ordering & volume continuity
  const activeNodes = neighbors.map(n => n.node);
  const volumeNeighbors = neighbors.filter(n => n.node.providerType === "volume" || n.edge.type === "alternate_continuity");
  
  for (const item of volumeNeighbors) {
    const titleLower = item.node.canonicalTitle.toLowerCase();
    if (seenTitles.has(titleLower)) continue;

    if (applySpoilerFilter(item.node.canonicalTitle)) {
      items.push({
        title: item.node.canonicalTitle,
        providerId: item.node.providerId,
        type: "volume",
        year: item.node.continuity ? parseInt(item.node.continuity) : undefined,
        reason: `Related continuity volume: "${item.node.canonicalTitle}"`
      });
      seenTitles.add(titleLower);
    }
  }

  // Priority 2: Event progression sequencing
  const eventNeighbors = neighbors.filter(n => n.node.providerType === "event" || n.edge.type === "same_event" || n.edge.type === "same_arc");
  for (const item of eventNeighbors) {
    const titleLower = item.node.canonicalTitle.toLowerCase();
    if (seenTitles.has(titleLower)) continue;

    if (applySpoilerFilter(item.node.canonicalTitle)) {
      items.push({
        title: item.node.canonicalTitle,
        providerId: item.node.providerId,
        type: "event",
        year: item.node.continuity ? parseInt(item.node.continuity) : undefined,
        reason: `Associated crossover event arc: "${item.node.canonicalTitle}"`
      });
      seenTitles.add(titleLower);
      console.log(`[EVENT_PROGRESSION] Ingested event neighbor: "${item.node.canonicalTitle}"`);
    }
  }

  // Sort dynamically by release year/continuity to enforce progression ordering
  const orderedItems = items.sort((a, b) => {
    if (a.year && b.year) return a.year - b.year;
    if (a.year) return -1;
    if (b.year) return 1;
    return 0;
  });

  if (orderedItems.some(i => i.type === "issue")) {
    console.log("[ISSUE_SEQUENCE_LOCKED] Dynamic issue timeline sequence resolved.");
  }

  return orderedItems.slice(0, MAX_READING_ORDER_ITEMS);
}

export function buildContinuationSuggestions(providerId: string, canonicalTitle: string): ContinuationSuggestionItem[] {
  const normKey = cleanAlphanumeric(canonicalTitle);

  // 1. Curated Sequel Timelines (isolated & minimal)
  if (CURATED_CONTINUATION_SUGGESTIONS[normKey]) {
    const suggestions = CURATED_CONTINUATION_SUGGESTIONS[normKey];
    for (const sugg of suggestions) {
      console.log(`[CONTINUATION_SUGGESTION] Curated narrative continuation matched: "${sugg.title}" (${sugg.type})`);
    }
    return suggestions;
  }

  // 2. Dynamic suggestions based on same-continuity neighborhood
  const neighbors = continuityGraphInstance.getNeighbors(providerId);
  const suggestions: ContinuationSuggestionItem[] = [];
  const seenTitles = new Set([canonicalTitle.toLowerCase()]);

  // Prioritize Same universe/continuity volumes & direct event extensions
  for (const item of neighbors) {
    const titleLower = item.node.canonicalTitle.toLowerCase();
    if (seenTitles.has(titleLower)) continue;

    const isSameContinuity = item.edge.type === "alternate_continuity" || item.edge.type === "same_universe";
    if (isSameContinuity && (item.node.providerType === "volume" || item.node.providerType === "story_arc" || item.node.providerType === "event")) {
      if (applySpoilerFilter(item.node.canonicalTitle)) {
        const suggType = item.node.providerType === "event" ? "event" : "volume";
        suggestions.push({
          title: item.node.canonicalTitle,
          providerId: item.node.providerId,
          type: suggType,
          reason: `Narrative continuation within the same canonical universe: "${item.node.canonicalTitle}"`
        });
        seenTitles.add(titleLower);
        console.log(`[CONTINUATION_SUGGESTION] Narrative adjacency suggetion locked: "${item.node.canonicalTitle}"`);
      }
    }
  }

  return suggestions.slice(0, 3);
}
