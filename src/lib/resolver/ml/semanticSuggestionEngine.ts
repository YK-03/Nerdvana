import { SemanticSuggestion, ExpansionProvider } from "./expansionTypes.js";
import { getTopologyEngine } from "../topology/inheritanceEngine.js";

/**
 * semanticSuggestionEngine.ts
 * 
 * Initial lightweight semantic expansion system.
 * Designed to be replaced with a full embedding engine in Phase 6.
 */

export class SemanticSuggestionEngine implements ExpansionProvider {
  /**
   * Discovers potential topology nodes based on query semantics.
   */
  async getSuggestions(query: string, mediaDomain?: string): Promise<SemanticSuggestion[]> {
    const norm = query.toLowerCase().trim();
    const suggestions: SemanticSuggestion[] = [];

    // 1. Long-tail alias discovery (Pattern matching)
    // Example: "Naruto Uzumaki" -> "Naruto"
    const fullResults = getTopologyEngine().search(norm, mediaDomain);
    fullResults.forEach(res => {
      suggestions.push({
        targetId: res.id,
        relationshipType: "exact",
        score: 1.0,
        reason: `Full phrase match on "${norm}"`,
      });
    });

    if (norm.split(" ").length > 1) {
      const parts = norm.split(" ");
      const firstName = parts[0];
      const lastName = parts[parts.length - 1];

      // Try searching for first name or last name in topology
      const firstResults = getTopologyEngine().search(firstName, mediaDomain);
      firstResults.forEach(res => {
        suggestions.push({
          targetId: res.id,
          relationshipType: "alias",
          score: 0.8,
          reason: `Partial name match on "${firstName}"`,
        });
      });

      const lastResults = getTopologyEngine().search(lastName, mediaDomain);
      lastResults.forEach(res => {
        suggestions.push({
          targetId: res.id,
          relationshipType: "alias",
          score: 0.8,
          reason: `Partial name match on "${lastName}"`,
        });
      });
    }

    // 2. Simple contextual similarity
    // If query contains a known franchise name but isn't an exact match
    // we suggest the franchise itself.
    const allNodes = Array.from(getTopologyEngine()["registry"].values());
    for (const node of allNodes) {
      if (norm.includes(node.parentFranchise?.toLowerCase() ?? "") && node.parentFranchise) {
        suggestions.push({
          targetId: node.id,
          relationshipType: "franchise_member",
          score: 0.6,
          reason: `Franchise keyword "${node.parentFranchise}" detected in query`,
        });
      }
    }

    // 3. TODO: In Phase 6, call Vector DB / Embedding search here

    return this.rankSuggestions(suggestions);
  }

  private rankSuggestions(suggestions: SemanticSuggestion[]): SemanticSuggestion[] {
    // Unique by targetId, pick highest score
    const map = new Map<string, SemanticSuggestion>();
    suggestions.forEach(s => {
      const existing = map.get(s.targetId);
      if (!existing || s.score > existing.score) {
        map.set(s.targetId, s);
      }
    });

    return Array.from(map.values()).sort((a, b) => b.score - a.score);
  }
}

let suggestionEngine: SemanticSuggestionEngine | null = null;
export function getSuggestionEngine(): SemanticSuggestionEngine {
  if (!suggestionEngine) {
    suggestionEngine = new SemanticSuggestionEngine();
  }
  return suggestionEngine;
}
