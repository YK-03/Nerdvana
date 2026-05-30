/**
 * schemaValidator.ts
 * 
 * Lightweight, explicit, and deterministic type guards to validate Nerdvana payloads.
 * No external dependencies, zero bundle overhead, and highly optimized.
 */

import type { ResolverContextPacket } from "../../app/canonicalResolver.js";

export interface GroundingValidationPayload {
  selectedSelectionValue: string | null;
  selectedCanonicalEntity: string | null;
  suggestions: any[];
  ambiguityLevel: "low" | "medium" | "high";
  behavior: "auto_resolve" | "require_selection" | "deferred";
  confidence: number;
}

export interface AnswerValidationResponse {
  answer: string;
  sources: any[];
  contextPacket: ResolverContextPacket;
}

export interface VisualValidationResponse {
  state: "SUCCESS" | "NO_COMPATIBLE_RESULTS" | "PROCESSING_ERROR" | "API_ERROR";
  asset?: {
    url: string;
    title: string;
    source: string;
    compatibilityScore: number;
    validated: boolean;
  };
}

/**
 * Validates canonical grounding payload structure
 */
export function validateGroundingPayload(data: any): data is GroundingValidationPayload {
  if (!data || typeof data !== "object") {
    console.warn("[Nerdvana] [Validator] [GROUNDING] Mismatch: payload must be a non-null object.");
    return false;
  }

  if (typeof data.behavior !== "string" || !["auto_resolve", "require_selection", "deferred"].includes(data.behavior)) {
    console.warn("[Nerdvana] [Validator] [GROUNDING] Mismatch: invalid or missing behavior string.");
    return false;
  }

  if (typeof data.ambiguityLevel !== "string" || !["low", "medium", "high"].includes(data.ambiguityLevel)) {
    console.warn("[Nerdvana] [Validator] [GROUNDING] Mismatch: invalid or missing ambiguityLevel.");
    return false;
  }

  if (typeof data.confidence !== "number" || isNaN(data.confidence)) {
    console.warn("[Nerdvana] [Validator] [GROUNDING] Mismatch: invalid or missing confidence number.");
    return false;
  }

  if (!Array.isArray(data.suggestions)) {
    console.warn("[Nerdvana] [Validator] [GROUNDING] Mismatch: suggestions must be an array.");
    return false;
  }

  return true;
}

/**
 * Validates AI generated answer API payload structure
 */
export function validateNerdvanaAnswerResponse(data: any): data is AnswerValidationResponse {
  if (!data || typeof data !== "object") {
    console.warn("[Nerdvana] [Validator] [ANSWER] Mismatch: payload must be a non-null object.");
    return false;
  }

  if (typeof data.answer !== "string" || !data.answer.trim()) {
    console.warn("[Nerdvana] [Validator] [ANSWER] Mismatch: missing or empty answer text string.");
    return false;
  }

  if (!Array.isArray(data.sources)) {
    console.warn("[Nerdvana] [Validator] [ANSWER] Mismatch: sources must be an array.");
    return false;
  }

  if (!data.contextPacket || typeof data.contextPacket !== "object") {
    console.warn("[Nerdvana] [Validator] [ANSWER] Mismatch: missing or invalid contextPacket.");
    return false;
  }

  const cp = data.contextPacket;
  if (typeof cp.canonicalEntity !== "string" || typeof cp.expandedEntity !== "string" || typeof cp.mediaLens !== "string") {
    console.warn("[Nerdvana] [Validator] [ANSWER] Mismatch: contextPacket has invalid core string properties.");
    return false;
  }

  return true;
}

/**
 * Validates visual provider lookup response payload structure
 */
export function validateVisualLookupResponse(data: any): data is VisualValidationResponse {
  if (!data || typeof data !== "object") {
    console.warn("[Nerdvana] [Validator] [VISUAL] Mismatch: payload must be a non-null object.");
    return false;
  }

  if (typeof data.state !== "string" || !["SUCCESS", "NO_COMPATIBLE_RESULTS", "PROCESSING_ERROR", "API_ERROR"].includes(data.state)) {
    console.warn("[Nerdvana] [Validator] [VISUAL] Mismatch: invalid or missing state string.");
    return false;
  }

  if (data.state === "SUCCESS") {
    const asset = data.asset;
    if (!asset || typeof asset !== "object") {
      console.warn("[Nerdvana] [Validator] [VISUAL] Mismatch: missing asset object on SUCCESS state.");
      return false;
    }

    if (typeof asset.url !== "string" || typeof asset.title !== "string" || typeof asset.source !== "string") {
      console.warn("[Nerdvana] [Validator] [VISUAL] Mismatch: asset has invalid url, title, or source string fields.");
      return false;
    }

    if (typeof asset.compatibilityScore !== "number" || isNaN(asset.compatibilityScore)) {
      console.warn("[Nerdvana] [Validator] [VISUAL] Mismatch: asset compatibilityScore must be a valid number.");
      return false;
    }
  }

  return true;
}
