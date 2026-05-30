import { findModularTopology } from "../topology/registry.js";

/**
 * namespacePrebinding.ts
 * Phase 8A: Establish franchise/namespace/continuity anchors BEFORE visual arbitration.
 */

export interface NamespacePrebindResult {
  franchiseNamespace: string | null;
  namespaceConfidence: number;
  continuityAnchor: string | null;
  continuityConfidence: number;
  blockedNamespaces: string[];
  thresholdScale: number;
  signals: string[];
}

const MARVEL_SIGNALS = ["marvel", "mcu", "avengers", "spiderman", "ironman", "iron man", "moon knight"];
const DC_SIGNALS = ["dc", "arkham", "batman", "superman", "justice league", "gotham", "wayne"];
const ANIME_SIGNALS = ["anime", "manga", "otaku", "japan", "sephiroth", "dante", "devil may cry"];

const NAMESPACE_ALIASES: Record<string, string[]> = {
  dc: ["dc", "gotham", "arkham", "wayne"],
  marvel: ["marvel", "mcu", "stark", "avengers"],
  anime: ["anime", "manga"],
  gaming: ["gaming", "game"],
};

function detectQualifiedNamespace(query: string): string | null {
  const match = query.match(/^([A-Za-z]+)::/);
  if (!match) return null;
  return match[1].toLowerCase();
}

function franchiseHintToNamespace(hint: string | undefined): string | null {
  if (!hint) return null;
  const h = hint.toLowerCase();
  if (h.includes("batman") || h.includes("superman") || h.includes("flash") || h.includes("joker")) return "dc";
  if (h.includes("spider") || h.includes("iron") || h.includes("avenger") || h.includes("marvel") || h.includes("punisher")) return "marvel";
  if (h.includes("geass") || h.includes("death note") || h.includes("titan") || h.includes("devil may cry") || h.includes("final fantasy")) return "anime";
  return null;
}

export function computeNamespacePrebinding(
  query: string,
  mediaLens: string,
  franchiseHint?: string,
  topologyNamespace?: string | null
): NamespacePrebindResult {
  const norm = query.toLowerCase().trim();
  const signals: string[] = [];
  let franchiseNamespace: string | null = null;
  let namespaceConfidence = 0;
  let continuityAnchor: string | null = null;
  let continuityConfidence = 0;

  const qualifiedNs = detectQualifiedNamespace(query);
  if (qualifiedNs) {
    franchiseNamespace = qualifiedNs;
    namespaceConfidence = 0.99;
    signals.push(`qualified_id:${qualifiedNs}`);
  }

  if (topologyNamespace) {
    franchiseNamespace = topologyNamespace.toLowerCase();
    namespaceConfidence = Math.max(namespaceConfidence, 0.95);
    signals.push(`topology_authoritative:${topologyNamespace}`);
  }

  const hintNs = franchiseHintToNamespace(franchiseHint);
  if (hintNs && namespaceConfidence < 0.9) {
    franchiseNamespace = hintNs;
    namespaceConfidence = Math.max(namespaceConfidence, 0.75);
    signals.push(`franchise_hint:${franchiseHint}`);
  }

  if (MARVEL_SIGNALS.some((s) => norm.includes(s))) {
    franchiseNamespace = "marvel";
    namespaceConfidence = Math.max(namespaceConfidence, norm.includes("mcu") ? 0.92 : 0.85);
    signals.push("signal:marvel");
  } else if (DC_SIGNALS.some((s) => norm.includes(s))) {
    franchiseNamespace = "dc";
    namespaceConfidence = Math.max(namespaceConfidence, norm.includes("gotham") || norm.includes("arkham") ? 0.92 : 0.85);
    signals.push("signal:dc");
  } else if (ANIME_SIGNALS.some((s) => norm.includes(s))) {
    franchiseNamespace = "anime";
    namespaceConfidence = Math.max(namespaceConfidence, 0.85);
    signals.push("signal:anime");
  }

  if (mediaLens === "anime" && !franchiseNamespace) {
    franchiseNamespace = "anime";
    namespaceConfidence = Math.max(namespaceConfidence, 0.6);
    signals.push("lens:anime");
  }

  if (norm.includes("prime") && !norm.includes("beyond")) {
    continuityAnchor = "prime";
    continuityConfidence = 0.9;
    signals.push("continuity:prime");
  }
  if (norm.includes("beyond") || norm.includes("batman beyond")) {
    continuityAnchor = "beyond";
    continuityConfidence = 0.88;
    signals.push("continuity:beyond");
  }
  if (norm.includes("arkham")) {
    continuityAnchor = "arkham";
    continuityConfidence = 0.85;
    signals.push("continuity:arkham");
  }

  const blockedNamespaces: string[] = [];
  if (franchiseNamespace && namespaceConfidence >= 0.8) {
    for (const [ns] of Object.entries(NAMESPACE_ALIASES)) {
      if (ns !== franchiseNamespace && ns !== "gaming") {
        blockedNamespaces.push(ns);
      }
    }
    if (franchiseNamespace === "dc") blockedNamespaces.push("marvel");
    if (franchiseNamespace === "marvel") blockedNamespaces.push("dc");
  }

  const thresholdScale =
    namespaceConfidence >= 0.85 ? 0.92 : namespaceConfidence >= 0.7 ? 0.96 : 1.0;

  return {
    franchiseNamespace,
    namespaceConfidence,
    continuityAnchor,
    continuityConfidence,
    blockedNamespaces,
    thresholdScale,
    signals,
  };
}

export function prebindFromQuery(
  query: string,
  mediaLens: string,
  franchiseHint?: string
): NamespacePrebindResult {
  const topologyHit = findModularTopology(query, mediaLens, true);
  const topologyNs = topologyHit?.id.split("::")[0] ?? null;
  return computeNamespacePrebinding(query, mediaLens, franchiseHint, topologyNs);
}

export function candidateNamespaceMatchesPrebind(
  candidateNamespace: string,
  prebind: NamespacePrebindResult
): boolean {
  if (!prebind.franchiseNamespace || prebind.namespaceConfidence < 0.5) return true;
  const ns = candidateNamespace.toLowerCase();
  const target = prebind.franchiseNamespace.toLowerCase();
  if (ns === target) return true;
  if (target === "dc" && ns === "gaming") return true;
  return false;
}
