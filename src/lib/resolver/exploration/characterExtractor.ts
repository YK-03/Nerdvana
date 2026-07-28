import { type Character } from "../../explorationTypes.js";

export function extractTmdbCharacters(rawData: any): Character[] {
  const characters: Character[] = [];
  const rawCast = Array.isArray(rawData?.credits?.cast)
    ? rawData.credits.cast
    : Array.isArray(rawData?.cast)
    ? rawData.cast
    : [];

  const sortedCast = [...rawCast].sort(
    (a: any, b: any) => (a.order ?? 999) - (b.order ?? 999)
  );

  for (const c of sortedCast.slice(0, 20)) {
    if (!c || typeof c !== "object" || (!c.character && !c.name)) continue;
    const actorName = c.name;
    const charName = c.character || c.name;
    characters.push({
      id: `tmdb::${c.id || c.credit_id || Math.random()}`,
      name: charName, // The fictional character name
      portrayedBy: actorName !== charName ? actorName : undefined, // Optional actor metadata
      imageUrl: c.profile_path
        ? `https://image.tmdb.org/t/p/w185${c.profile_path}`
        : undefined,
    });
  }

  return characters;
}

export function extractAnilistCharacters(rawData: any): Character[] {
  const characters: Character[] = [];
  const edges =
    rawData?.characters?.edges ||
    (Array.isArray(rawData?.characters) ? rawData.characters : []);
    
  if (Array.isArray(edges)) {
    const sortedEdges = [...edges].sort((a: any, b: any) => {
      const roleA = a.role || a.characterRole;
      const roleB = b.role || b.characterRole;
      if (roleA === "MAIN" && roleB !== "MAIN") return -1;
      if (roleA !== "MAIN" && roleB === "MAIN") return 1;
      return 0;
    });

    for (const edge of sortedEdges.slice(0, 20)) {
      const node = edge.node || edge;
      if (!node || typeof node !== "object") continue;
      const charName =
        typeof node.name === "string"
          ? node.name
          : node.name?.full || node.name?.userPreferred || node.name?.native;
      if (!charName) continue;

      let roleTitle: "MAIN" | "SUPPORTING" | string | undefined = undefined;
      if (typeof edge.role === "string") {
        roleTitle = edge.role === "MAIN" ? "MAIN" : "SUPPORTING";
      }

      characters.push({
        id: `anilist::${node.id || Math.random()}`,
        name: charName,
        role: roleTitle,
        description:
          typeof node.description === "string"
            ? node.description.replace(/<[^>]*>/g, "").trim().slice(0, 150)
            : undefined,
        imageUrl: node.image?.large || node.image?.medium || undefined,
      });
    }
  }
  return characters;
}

export function extractComicVineCharacters(rawData: any): Character[] {
  const characters: Character[] = [];
  let rawChars: any[] = [];
  
  if (Array.isArray(rawData?.character_credits) && rawData.character_credits.length > 0) {
    rawChars = rawData.character_credits;
  } else if (Array.isArray(rawData?.characters) && rawData.characters.length > 0) {
    rawChars = rawData.characters;
  }

  for (const c of rawChars) {
    if (!c || typeof c !== "object" || !c.name) continue;
    characters.push({
      id: `cv::${c.id}`,
      name: c.name,
      description:
        typeof c.deck === "string"
          ? c.deck
          : typeof c.description === "string"
          ? c.description
          : undefined,
      imageUrl:
        c.image?.small_url ||
        c.image?.super_url ||
        c.image?.icon_url ||
        undefined,
    });
  }

  return characters;
}

export function extractIgdbCharacters(rawData: any): Character[] {
  const characters: Character[] = [];
  const rawChars = Array.isArray(rawData?.characters)
    ? rawData.characters
    : [];
    
  for (const c of rawChars.slice(0, 15)) {
    if (!c || typeof c !== "object" || !c.name) continue;
    characters.push({
      id: `igdb::${c.id || Math.random()}`,
      name: c.name,
      description:
        typeof c.description === "string"
          ? c.description
          : typeof c.summary === "string"
          ? c.summary
          : undefined,
      imageUrl: c.mug_shot?.url
        ? c.mug_shot.url.startsWith("//")
          ? `https:${c.mug_shot.url}`
          : c.mug_shot.url
        : undefined,
    });
  }

  return characters;
}
