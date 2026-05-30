/**
 * lensFence.ts
 *
 * Implements cross-lens fencing, source/lens checks, and lens scoring.
 */

import type { MediaLens } from "../../app/mediaLens.js";
import type { AliasDescriptor, AliasOrigin, ContinuityType } from "./topology/topologyTypes.js";

export type MediaType = "anime" | "movies" | "tv" | "games" | "comics";

export type LensAuthority = "strict" | "cross_domain" | "exploration";

export interface CatalogEntry {
  canonicalEntity: string;
  selectionValue: string;
  displayTitle: string;
  franchise: string | null;
  mediaLenses: MediaLens[];
  mediaLabel: string;
  namespaceLabel: string;
  continuityLabel: string | null;
  continuityType: ContinuityType | null;
  metadataLabel?: string | null;
  universe: string | null;
  qualifiedId: string | null;
  aliases: string[];
  directAliases?: string[];
  inheritedAliases?: string[];
  aliasProvenance?: AliasDescriptor[];
  source: "topology" | "continuity" | "registry" | "supplemental";
  thumbnailUrl: string | null;
}

const LENS_SUPPRESSION: Record<MediaLens, MediaLens[]> = {
  movies: ["anime", "games", "comics"],
  tv: ["anime", "games", "comics"],
  anime: ["movies", "tv"],
  games: ["movies", "tv", "comics"],
  comics: ["movies", "tv", "games"],
};

function normalize(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ");
}

export function sourceSupportsLens(source: string, mediaType: MediaType): boolean {
  const sourceLensMap: Record<string, MediaType[]> = {
    jikan: ["anime"],
    mal: ["anime"],
    tmdb: ["movies", "tv"],
    igdb: ["games"],
    rawg: ["games"],
    comicvine: ["comics"],
  };

  return (sourceLensMap[source] ?? []).includes(mediaType);
}

export function lensScore(query: string, activeLens: MediaLens, entry: CatalogEntry): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const normQuery = normalize(query);
  const affinityMatrix: Record<MediaLens, Record<MediaLens, number>> = {
    movies: { movies: 68, tv: 22, comics: -28, anime: -42, games: -46 },
    tv: { tv: 68, movies: 26, comics: -26, anime: -34, games: -42 },
    anime: { anime: 68, tv: 20, movies: -24, games: -22, comics: -18 },
    games: { games: 68, anime: 10, movies: -28, tv: -30, comics: -26 },
    comics: { comics: 68, movies: -18, tv: -22, anime: -18, games: -24 },
  };

  let score = Math.max(...entry.mediaLenses.map((lens) => affinityMatrix[activeLens][lens] ?? -30));

  if (entry.mediaLenses.includes(activeLens)) {
    reasons.push("lens-match");
  } else {
    reasons.push("lens-mismatch");
  }

  if (activeLens === "games") {
    if (entry.mediaLenses.includes("games")) {
      score += 45;
      reasons.push("games-lens-boost");

      if (entry.source === "topology") {
        score += 30;
        reasons.push("games-topology-boost");
      }

      if (entry.continuityLabel) {
        score += 15;
        reasons.push("games-continuity-boost");
      }
    } else {
      score -= 80;
      reasons.push("games-lens-suppression");
    }

    const isGenericRoot =
      entry.qualifiedId === "DC::Batman (DC Comics)" ||
      entry.qualifiedId === "DC::Superman" ||
      entry.qualifiedId === "DC::Flash" ||
      (entry.franchise && entry.mediaLenses.length > 1 && !entry.continuityLabel);

    if (isGenericRoot) {
      score -= 35;
      reasons.push("generic-franchise-root-suppression");
    }
  } else {
    if (entry.mediaLenses.length > 1) {
      score -= (entry.mediaLenses.length - 1) * 6;
    }
    if (entry.mediaLenses.length === 1 && entry.mediaLenses[0] === activeLens) {
      score += 18;
      reasons.push("lens-specialized");
    }
    if (entry.continuityType && entry.mediaLenses.includes(activeLens) && entry.continuityType !== "prime") {
      score += 10;
      reasons.push("continuity-specialized");
    }
    if (
      activeLens === "movies" &&
      entry.mediaLenses.includes("movies") &&
      (entry.mediaLenses.includes("comics") || entry.mediaLenses.includes("games"))
    ) {
      score -= 26;
      reasons.push("broad-cross-media-penalty");
    }
    if (
      activeLens === "tv" &&
      entry.mediaLenses.includes("tv") &&
      entry.mediaLenses.length > 1
    ) {
      score -= 16;
      reasons.push("broad-tv-penalty");
    }
  }

  if (LENS_SUPPRESSION[activeLens].some((lens) => entry.mediaLenses.includes(lens)) && !entry.mediaLenses.includes(activeLens)) {
    score -= 14;
  }

  if (normQuery.includes("movie") && entry.mediaLenses.includes("movies")) score += 15;
  if (normQuery.includes("tv") && entry.mediaLenses.includes("tv")) score += 15;
  if (normQuery.includes("anime") && entry.mediaLenses.includes("anime")) score += 15;
  if (normQuery.includes("game") && entry.mediaLenses.includes("games")) score += 15;
  if (normQuery.includes("comic") && entry.mediaLenses.includes("comics")) score += 15;
  if (normQuery.includes("reeves") && normalize(entry.continuityLabel ?? "").includes("reeves")) score += 22;
  if (normQuery.includes("arkham") && normalize(entry.continuityLabel ?? "").includes("arkham")) score += 22;
  if (normQuery.includes("mcu") && normalize(entry.continuityLabel ?? "").includes("mcu")) score += 22;

  return { score, reasons };
}
