export interface ThemeProfile {
  themes: string[];           
  archetypes: string[];       
  narrativeStructures: string[]; 
  emotionalTone: string;      
  visualMood: string;         
}

// Highly curated theme profiles for core entities (Depth > Breadth)
const ENTITY_THEMES: Record<string, ThemeProfile> = {
  // === MOVIES ===
  "Inception": {
    themes: ["reality vs dreams", "memory", "guilt", "time dilation"],
    archetypes: ["unreliable narrator", "tragic protagonist", "heist crew"],
    narrativeStructures: ["dream within a dream", "nonlinear", "ambiguous ending"],
    emotionalTone: "contemplative",
    visualMood: "noir"
  },
  "Interstellar": {
    themes: ["cosmic survival", "family", "time dilation", "humanity's future"],
    archetypes: ["explorer", "ghost"],
    narrativeStructures: ["temporal paradox", "cross-time communication"],
    emotionalTone: "epic",
    visualMood: "cosmic"
  },
  "Memento": {
    themes: ["memory", "identity", "grief", "self-deception"],
    archetypes: ["unreliable narrator", "amnesiac"],
    narrativeStructures: ["reverse chronology", "fragmented"],
    emotionalTone: "paranoia",
    visualMood: "noir"
  },
  "The Matrix": {
    themes: ["simulated reality", "free will", "control vs freedom"],
    archetypes: ["the one", "mentor", "awakened"],
    narrativeStructures: ["hero's journey", "rebellion"],
    emotionalTone: "intense",
    visualMood: "cyberpunk"
  },
  "Blade Runner 2049": {
    themes: ["artificial humanity", "loneliness", "memory implants", "existentialism"],
    archetypes: ["replicant", "holographic companion"],
    narrativeStructures: ["noir investigation", "slow burn"],
    emotionalTone: "melancholic",
    visualMood: "atmospheric"
  },
  "Everything Everywhere All at Once": {
    themes: ["multiverse", "generational trauma", "nihilism vs kindness"],
    archetypes: ["unlikely hero", "fractured family"],
    narrativeStructures: ["multiversal convergence", "absurdist"],
    emotionalTone: "whimsical",
    visualMood: "vibrant"
  },

  // === ANIME ===
  "Attack on Titan": {
    themes: ["freedom", "cycle of violence", "prophecy", "moral ambiguity"],
    archetypes: ["fallen hero", "child soldier"],
    narrativeStructures: ["perspective flip", "time-loop memory"],
    emotionalTone: "bleak",
    visualMood: "gritty"
  },
  "Neon Genesis Evangelion": {
    themes: ["existential dread", "isolation", "psychological trauma", "identity"],
    archetypes: ["reluctant pilot", "absent father"],
    narrativeStructures: ["psychological deconstruction", "apocalyptic"],
    emotionalTone: "depressive",
    visualMood: "atmospheric"
  },
  "Fullmetal Alchemist: Brotherhood": {
    themes: ["equivalent exchange", "brotherhood", "war crimes", "truth"],
    archetypes: ["seeker", "corrupt military"],
    narrativeStructures: ["epic journey", "political conspiracy"],
    emotionalTone: "hopeful",
    visualMood: "vibrant"
  },
  "Death Note": {
    themes: ["justice vs murder", "god complex", "morality"],
    archetypes: ["genius sociopath", "eccentric detective"],
    narrativeStructures: ["cat and mouse", "psychological thriller"],
    emotionalTone: "tense",
    visualMood: "noir"
  },

  // === GAMING ===
  "Elden Ring": {
    themes: ["shattered order", "ambition", "decay", "free will"],
    archetypes: ["tarnished", "demigod", "outer god"],
    narrativeStructures: ["environmental storytelling", "fragmented lore"],
    emotionalTone: "melancholic",
    visualMood: "atmospheric"
  },
  "Bloodborne": {
    themes: ["cosmic horror", "blood ministration", "nightmare", "hubris"],
    archetypes: ["hunter", "great one"],
    narrativeStructures: ["dream descent", "Lovecraftian escalation"],
    emotionalTone: "terrifying",
    visualMood: "gothic"
  },
  "The Last of Us": {
    themes: ["survival", "found family", "moral ambiguity", "grief"],
    archetypes: ["smuggler", "immune child"],
    narrativeStructures: ["road trip", "tragic climax"],
    emotionalTone: "devastating",
    visualMood: "gritty"
  },
  "Outer Wilds": {
    themes: ["curiosity", "time loop", "acceptance of endings", "cosmic insignificance"],
    archetypes: ["explorer", "ancient race"],
    narrativeStructures: ["time loop", "knowledge accumulation"],
    emotionalTone: "contemplative",
    visualMood: "cosmic"
  },
  "NieR:Automata": {
    themes: ["existentialism", "purpose", "cycle of war", "artificial humanity"],
    archetypes: ["android", "machine lifeform"],
    narrativeStructures: ["multiple playthroughs", "perspective shift"],
    emotionalTone: "melancholic",
    visualMood: "bleak"
  },

  // === COMICS / TV ===
  "Batman": {
    themes: ["justice", "fear", "trauma", "moral boundaries"],
    archetypes: ["vigilante", "rogues gallery"],
    narrativeStructures: ["detective noir", "origin trauma"],
    emotionalTone: "dark",
    visualMood: "noir"
  },
  "Watchmen": {
    themes: ["who watches the watchmen", "cold war paranoia", "moral absolutism"],
    archetypes: ["cynical vigilante", "god-like being"],
    narrativeStructures: ["deconstruction", "non-linear"],
    emotionalTone: "cynical",
    visualMood: "gritty"
  },
  "True Detective": {
    themes: ["existential pessimism", "corruption", "obsession", "time is a flat circle"],
    archetypes: ["broken detective", "cult"],
    narrativeStructures: ["dual timelines", "unreliable memory"],
    emotionalTone: "bleak",
    visualMood: "atmospheric"
  },
  "Dark": {
    themes: ["determinism", "time travel", "family secrets", "apocalypse"],
    archetypes: ["time traveler", "tragic lover"],
    narrativeStructures: ["bootstrap paradox", "multi-generational"],
    emotionalTone: "tense",
    visualMood: "noir"
  }
};

const GENRE_THEME_MAP: Record<string, string[]> = {
  "sci-fi": ["technology", "future", "humanity"],
  "science fiction": ["technology", "future", "humanity"],
  "thriller": ["suspense", "moral ambiguity", "paranoia"],
  "horror": ["fear", "survival", "isolation"],
  "mystery": ["truth", "investigation", "secrets"],
  "fantasy": ["magic", "destiny", "good vs evil"],
  "action": ["conflict", "heroism", "survival"],
  "drama": ["relationships", "tragedy", "human condition"],
  "rpg": ["progression", "choice", "world-building"]
};

// Derive default mood based on genre matches if entity is unknown
export function extractThemeProfile(
  entity: string,
  franchise: string | null,
  genres: string[],
  mediaLens: string
): ThemeProfile {
  // 1. Direct Entity Match (Highest Confidence)
  if (ENTITY_THEMES[entity]) {
    return ENTITY_THEMES[entity];
  }

  // 2. Franchise Match (Fallback to parent franchise themes)
  if (franchise && ENTITY_THEMES[franchise]) {
    return ENTITY_THEMES[franchise];
  }

  // 3. Genre-based Derivation (Medium Confidence)
  const derivedThemes = new Set<string>();
  genres.forEach(g => {
    const lowerG = g.toLowerCase();
    if (GENRE_THEME_MAP[lowerG]) {
      GENRE_THEME_MAP[lowerG].forEach(t => derivedThemes.add(t));
    }
  });

  if (derivedThemes.size > 0) {
    return {
      themes: Array.from(derivedThemes),
      archetypes: ["protagonist"],
      narrativeStructures: ["linear"],
      emotionalTone: "standard",
      visualMood: "atmospheric" // Safe fallback
    };
  }

  // 4. Ultimate Fallback based on lens
  return {
    themes: ["exploration", "story"],
    archetypes: ["protagonist"],
    narrativeStructures: ["linear"],
    emotionalTone: "standard",
    visualMood: "standard"
  };
}
