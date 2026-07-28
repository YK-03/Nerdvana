import { type ExplorationDTO, type Character } from "../explorationTypes.js";
import { CharacterResolver } from "./exploration/characterResolver.js";

export interface ExplorationRequest {
  provider: string | null;
  rawData: any;
}

export class ExplorationBuilder {
  static async build(request: ExplorationRequest, entityName: string, mediaType: string): Promise<ExplorationDTO> {
    const characters = await CharacterResolver.resolve(request, entityName, mediaType);

    console.log("=== STAGE 3: EXPLORATION BUILDER ===", {
      provider: request.provider,
      hasRawData: !!request.rawData,
      builtCharactersLength: characters.length,
      firstCharacter: characters[0] ?? null
    });

    return {
      characters,
      timeline: this.buildTimeline(request),
      locations: this.buildLocations(request),
      factions: this.buildFactions(request),
      artifacts: this.buildArtifacts(request),
      relatedMedia: this.buildRelatedMedia(request)
    };
  }

  private static buildTimeline(request: ExplorationRequest): any[] {
    return [];
  }

  private static buildLocations(request: ExplorationRequest): any[] {
    return [];
  }

  private static buildFactions(request: ExplorationRequest): any[] {
    return [];
  }

  private static buildArtifacts(request: ExplorationRequest): any[] {
    return [];
  }

  private static buildRelatedMedia(request: ExplorationRequest): any[] {
    return [];
  }
}
