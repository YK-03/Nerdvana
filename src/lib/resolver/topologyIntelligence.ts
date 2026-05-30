import { getTopologyEngine } from "./topology/inheritanceEngine.js";
import type { ResolvedTopology } from "./topology/topologyTypes.js";

/**
 * Canon Relationship Union Type
 */
export type CanonRelationship =
  | "same_continuity"
  | "alternate_timeline"
  | "adaptation"
  | "variant"
  | "multiverse_counterpart"
  | "soft_reboot"
  | "hard_reboot"
  | "non_canon"
  | "inspired_by"
  | "spin_off"
  | "prequel"
  | "sequel";

/**
 * Human-curated relationship certainty metadata (Section 5).
 * Not AI-generated; serves as static confidence layer.
 */
export const RELATIONSHIP_CONFIDENCE: Record<CanonRelationship, number> = {
  same_continuity: 1.0,
  adaptation: 0.95,
  alternate_timeline: 0.85,
  variant: 0.80,
  multiverse_counterpart: 0.75,
  soft_reboot: 0.80,
  hard_reboot: 0.70,
  non_canon: 0.60,
  inspired_by: 0.65,
  spin_off: 0.80,
  prequel: 0.90,
  sequel: 0.90,
};

export interface CanonRelationshipEdge {
  sourceId: string;
  targetId: string;
  type: CanonRelationship;
  reasoning: string;
  certainty: number;
}

/**
 * Curated Relationship Graph (Section 1 & 2).
 * Strictly static, read-only, and human-governed.
 */
export const CANON_RELATIONSHIP_GRAPH: CanonRelationshipEdge[] = [
  {
    sourceId: "Marvel::Kang::MCU",
    targetId: "Marvel::Kang::Comics",
    type: "adaptation",
    reasoning: "MCU Kang is a direct cinematic adaptation of the prime Marvel Comics character.",
    certainty: RELATIONSHIP_CONFIDENCE.adaptation,
  },
  {
    sourceId: "Marvel::Miles::Spider-Verse",
    targetId: "Marvel::Miles::Comics",
    type: "adaptation",
    reasoning: "Spider-Verse Miles Morales is a stylized animated cinematic adaptation of the prime Comics character.",
    certainty: RELATIONSHIP_CONFIDENCE.adaptation,
  },
  {
    sourceId: "Marvel::Loki::Sylvie",
    targetId: "Marvel::Loki",
    type: "variant",
    reasoning: "Sylvie is a female timeline variant of MCU Loki.",
    certainty: RELATIONSHIP_CONFIDENCE.variant,
  },
  {
    sourceId: "Marvel::Loki::Classic",
    targetId: "Marvel::Loki",
    type: "variant",
    reasoning: "Classic Loki is an older, alternate timeline variant of MCU Loki.",
    certainty: RELATIONSHIP_CONFIDENCE.variant,
  },
  {
    sourceId: "DC::Batman::Flashpoint",
    targetId: "DC::Batman (DC Comics)",
    type: "alternate_timeline",
    reasoning: "Flashpoint Batman (Thomas Wayne) exists in an alternate timeline created by Flash's temporal disruption.",
    certainty: RELATIONSHIP_CONFIDENCE.alternate_timeline,
  },
  {
    sourceId: "DC::Batman::DCEU",
    targetId: "DC::Batman (DC Comics)",
    type: "adaptation",
    reasoning: "DCEU Batman is a cinematic adaptation of Bruce Wayne Batman.",
    certainty: RELATIONSHIP_CONFIDENCE.adaptation,
  },
  {
    sourceId: "DC::Batman::Reeves",
    targetId: "DC::Batman (DC Comics)",
    type: "soft_reboot",
    reasoning: "Matt Reeves' Batman (Robert Pattinson) is a cinematic soft reboot focusing on a younger Bruce Wayne.",
    certainty: RELATIONSHIP_CONFIDENCE.soft_reboot,
  },
  {
    sourceId: "DC::Joker::2019",
    targetId: "DC::Joker",
    type: "inspired_by",
    reasoning: "Todd Phillips' Joker (Arthur Fleck) is an independent character study loosely inspired by the DC Comics Joker.",
    certainty: RELATIONSHIP_CONFIDENCE.inspired_by,
  },
  {
    sourceId: "Gaming::Witcher::Game",
    targetId: "Gaming::Witcher::Novel",
    type: "sequel",
    reasoning: "The Witcher game trilogy acts as an unofficial narrative sequel to Andrzej Sapkowski's original book series.",
    certainty: RELATIONSHIP_CONFIDENCE.sequel,
  },
  {
    sourceId: "Gaming::Witcher::Netflix",
    targetId: "Gaming::Witcher::Novel",
    type: "adaptation",
    reasoning: "The Netflix Witcher series is a direct television series adaptation of the original novels.",
    certainty: RELATIONSHIP_CONFIDENCE.adaptation,
  },
  {
    sourceId: "Anime::Cyberpunk::Edgerunners",
    targetId: "Gaming::Cyberpunk::2077",
    type: "spin_off",
    reasoning: "Cyberpunk Edgerunners is an anime spin-off taking place in the Night City setting of the Cyberpunk 2077 game.",
    certainty: RELATIONSHIP_CONFIDENCE.spin_off,
  },
  {
    sourceId: "Gaming::Persona::P5R",
    targetId: "Gaming::Persona::P5",
    type: "variant",
    reasoning: "Persona 5 Royal is an expanded canonical variant of the original Persona 5 game, adding new semesters and characters.",
    certainty: RELATIONSHIP_CONFIDENCE.variant,
  },
  {
    sourceId: "Anime::Fate::Zero",
    targetId: "Anime::Fate::StayNight",
    type: "prequel",
    reasoning: "Fate/Zero details the Fourth Holy Grail War, acting as a direct prequel to the events of Fate/Stay Night.",
    certainty: RELATIONSHIP_CONFIDENCE.prequel,
  },
  {
    sourceId: "Anime::Fate::Apocrypha",
    targetId: "Anime::Fate::StayNight",
    type: "alternate_timeline",
    reasoning: "Fate/Apocrypha is a parallel world spin-off where the Holy Grail was removed from Fuyuki, branching from Fate/Stay Night.",
    certainty: RELATIONSHIP_CONFIDENCE.alternate_timeline,
  },
  {
    sourceId: "Anime::Evangelion::Rebuild",
    targetId: "Anime::Evangelion::Original",
    type: "alternate_timeline",
    reasoning: "Rebuild of Evangelion is a theatrical tetralogy that starts as a soft reboot but branches into a distinct alternate timeline.",
    certainty: RELATIONSHIP_CONFIDENCE.alternate_timeline,
  },
  {
    sourceId: "Anime::DragonBall::GT",
    targetId: "Anime::DragonBall::Z",
    type: "non_canon",
    reasoning: "Dragon Ball GT was produced as an anime-original sequel to DBZ without Akira Toriyama's direct manga involvement, and is considered non-canon.",
    certainty: RELATIONSHIP_CONFIDENCE.non_canon,
  },
  {
    sourceId: "Anime::DragonBall::Super",
    targetId: "Anime::DragonBall::Z",
    type: "same_continuity",
    reasoning: "Dragon Ball Super is the official canonical sequel to Dragon Ball Z, written with direct involvement from Akira Toriyama.",
    certainty: RELATIONSHIP_CONFIDENCE.same_continuity,
  },
  {
    sourceId: "TV::TheBoys::TV",
    targetId: "Comics::TheBoys::Comics",
    type: "adaptation",
    reasoning: "The Boys TV series is a television adaptation of Garth Ennis' comic series, modifying various storylines and character dynamics.",
    certainty: RELATIONSHIP_CONFIDENCE.adaptation,
  },
  {
    sourceId: "TV::Invincible::TV",
    targetId: "Comics::Invincible::Comics",
    type: "adaptation",
    reasoning: "Invincible TV series is an animated adaptation of Robert Kirkman's comic book series, keeping close fidelity to the comic source.",
    certainty: RELATIONSHIP_CONFIDENCE.adaptation,
  },
  {
    sourceId: "TV::OnePiece::LiveAction",
    targetId: "Anime::OnePiece::Anime",
    type: "adaptation",
    reasoning: "Netflix One Piece is a live-action television adaptation of Eiichiro Oda's original manga and anime story.",
    certainty: RELATIONSHIP_CONFIDENCE.adaptation,
  }
];

/**
 * Returns a curated relationship between two topology nodes.
 */
export function getRelationship(sourceId: string, targetId: string): CanonRelationshipEdge | null {
  return CANON_RELATIONSHIP_GRAPH.find(
    edge =>
      (edge.sourceId === sourceId && edge.targetId === targetId) ||
      (edge.sourceId === targetId && edge.targetId === sourceId)
  ) ?? null;
}

/**
 * Traces the adaptation lineage shift between source and target media formats.
 */
export function determineAdaptationLineage(sourceNode: ResolvedTopology, targetNode: ResolvedTopology): string {
  const sDomain = sourceNode.id.includes("::Novel") ? "book" : sourceNode.mediaDomains[0] ?? "unknown";
  const tDomain = targetNode.mediaDomains[0] ?? "unknown";

  const s = sDomain.toLowerCase();
  const t = tDomain.toLowerCase();

  if (s === "comics" && t === "movies") return "comic → film";
  if (s === "comics" && t === "tv") return "comic → TV adaptation";
  if (s === "games" && t === "tv") return "game → TV adaptation";
  if (s === "anime" && t === "tv") return "anime → live action";
  if (s === "comics" && t === "games") return "comic → game";
  if (s === "book" && t === "games") return "book → game";
  if (s === "book" && t === "tv") return "book → TV adaptation";
  if (s === "book" && t === "movies") return "book → movie";

  return `${s} → ${t}`;
}

/**
 * Resolves the list of sibling variants to prevent identity collapse (Section 4).
 */
export function getVariantFamily(id: string): ResolvedTopology[] {
  const engine = getTopologyEngine();
  const current = engine.resolve(id);
  if (!current) return [];

  const baseId = current.baseId || current.id;

  return engine
    .list()
    .filter(
      node =>
        node.id !== id &&
        (node.baseId === baseId || node.id === baseId || (node.parentFranchise === current.parentFranchise && node.id !== current.id))
    );
}
