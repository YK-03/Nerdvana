import { type Character } from "../../explorationTypes.js";

/**
 * Fallback engine for extracting characters when structured provider data fails.
 * In a production environment, this would call an LLM (e.g. Gemini 1.5 Flash).
 */
export async function generateFictionalCharacters(
  entityName: string,
  mediaType: string
): Promise<Character[]> {
  console.warn(`[AI Fallback] Aborting fallback for ${entityName} (${mediaType}). Returning empty array to suppress Characters section.`);
  
  // Per product rules, we never return fake/placeholder characters.
  // The frontend will automatically hide the Characters section if the array is empty.
  return [];
}
