import { type Character } from "../../explorationTypes.js";
import { type ExplorationRequest } from "../explorationBuilder.js";
import {
  extractTmdbCharacters,
  extractAnilistCharacters,
  extractComicVineCharacters,
  extractIgdbCharacters,
} from "./characterExtractor.js";
import { normalizeCharacters } from "./characterNormalizer.js";
import { generateFictionalCharacters } from "./aiCharacterFallback.js";

export class CharacterResolver {
  static async resolve(
    request: ExplorationRequest,
    entityName: string,
    mediaType: string
  ): Promise<Character[]> {
    let characters: Character[] = [];

    // 1. Media-specific synchronous extraction
    if (request.rawData) {
      if (request.provider?.startsWith("tmdb::")) {
        characters = extractTmdbCharacters(request.rawData);
      } else if (
        request.provider?.startsWith("anilist::") ||
        request.provider?.startsWith("jikan::")
      ) {
        characters = extractAnilistCharacters(request.rawData);
      } else if (request.provider?.startsWith("comicvine::")) {
        characters = extractComicVineCharacters(request.rawData);
      } else if (request.provider?.startsWith("igdb::")) {
        characters = extractIgdbCharacters(request.rawData);
      }
    }

    // 2. Normalize whatever we found
    let normalized = normalizeCharacters(characters);

    // 3. Graceful Fallback if structured data is weak or missing (< 3 characters)
    if (normalized.length < 3) {
      const fallbackChars = await generateFictionalCharacters(
        entityName,
        mediaType
      );
      // Combine and re-normalize (AI might generate duplicates or generic roles too)
      normalized = normalizeCharacters([...normalized, ...fallbackChars]);
    }

    return normalized;
  }
}
