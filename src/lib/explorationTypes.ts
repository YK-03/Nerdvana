export interface Character {
  id: string;
  name: string;
  title?: string;
  description?: string;
  imageUrl?: string;
  portrayedBy?: string;
  role?: "MAIN" | "SUPPORTING" | string;
}

export interface ExplorationDTO {
  characters: Character[];
  timeline: any[];
  locations: any[];
  factions: any[];
  artifacts: any[];
  relatedMedia: any[];
}

/** Evidence produced only after a server-side provider response is available. */
export interface ServerCanonicalEvidence {
  provenance: "server-provider-response";
  providerId: string;
  title?: string | null;
  characters: Character[];
}
