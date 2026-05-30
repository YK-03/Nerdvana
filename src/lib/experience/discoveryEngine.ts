import { ThemeProfile } from "./themeEngine";
import { DISCOVERY_HEADERS } from "./experienceLanguage";

// Note: In a real app we'd import ResolverContextPacket, but to avoid circular deps 
// or complex type imports, we define the shape we need here.
interface ContextPacketShape {
  canonicalEntity: string;
  parentFranchise: string | null;
  universe: string | null;
  mediaLens: string;
}

export interface DiscoveryItem {
  title: string;
  subtitle?: string;
  query: string;
  mediaLens?: string;
  mood?: string;
}

export interface DiscoveryRail {
  id: string;
  label: string;
  editorial: string;
  items: DiscoveryItem[];
}

// Highly curated connections (Depth > Breadth)
const THEMATIC_CONNECTIONS: Record<string, { title: string, subtitle: string, query: string, lens: string }[]> = {
  "Inception": [
    { title: "Shutter Island", subtitle: "Memory & Reality", query: "Shutter Island reality", lens: "movies" },
    { title: "Primer", subtitle: "Time & Consequence", query: "Primer time travel", lens: "movies" },
    { title: "The Matrix", subtitle: "Simulated Existence", query: "The Matrix simulation", lens: "movies" },
    { title: "Paprika", subtitle: "Dream Architecture", query: "Paprika dreams", lens: "anime" }
  ],
  "Interstellar": [
    { title: "Arrival", subtitle: "Time & Language", query: "Arrival aliens time", lens: "movies" },
    { title: "2001: A Space Odyssey", subtitle: "Cosmic Evolution", query: "2001 space odyssey ending", lens: "movies" },
    { title: "Contact", subtitle: "Faith & Science", query: "Contact alien message", lens: "movies" },
    { title: "Outer Wilds", subtitle: "Cosmic Acceptance", query: "Outer Wilds time loop", lens: "gaming" }
  ],
  "Memento": [
    { title: "Fight Club", subtitle: "Fractured Identity", query: "Fight club narrator", lens: "movies" },
    { title: "Gone Girl", subtitle: "Unreliable Truths", query: "Gone Girl manipulation", lens: "movies" },
    { title: "Mulholland Drive", subtitle: "Dream Logic", query: "Mulholland Drive meaning", lens: "movies" }
  ],
  "Attack on Titan": [
    { title: "Fullmetal Alchemist", subtitle: "War & Sacrifice", query: "FMA equivalent exchange", lens: "anime" },
    { title: "Code Geass", subtitle: "Moral Ambiguity", query: "Code Geass zero requiem", lens: "anime" },
    { title: "Neon Genesis Evangelion", subtitle: "Apocalyptic Dread", query: "Evangelion human instrumentality", lens: "anime" },
    { title: "NieR:Automata", subtitle: "Cycle of Violence", query: "Nier Automata endless war", lens: "gaming" }
  ],
  "Elden Ring": [
    { title: "Dark Souls", subtitle: "Fading Fire", query: "Dark souls lore", lens: "gaming" },
    { title: "Bloodborne", subtitle: "Cosmic Horror", query: "Bloodborne great ones", lens: "gaming" },
    { title: "Berserk", subtitle: "Struggle Against Fate", query: "Berserk eclipse", lens: "comics" }
  ],
  "Batman": [
    { title: "Watchmen", subtitle: "Vigilante Deconstruction", query: "Watchmen morality", lens: "comics" },
    { title: "Daredevil", subtitle: "Justice & Faith", query: "Daredevil morality", lens: "tv" },
    { title: "Se7en", subtitle: "Noir Investigation", query: "Se7en ending", lens: "movies" }
  ]
};

const FRANCHISE_EXPLORATION: Record<string, { title: string, query: string }[]> = {
  "Inception": [
    { title: "Dream Architecture", query: "How does dream sharing work in Inception?" },
    { title: "The Totem Logic", query: "Explain Cobb's totem in Inception" }
  ],
  "Interstellar": [
    { title: "The Tesseract", query: "What is the tesseract in Interstellar?" },
    { title: "Planetary Relativity", query: "Time dilation on Miller's planet" }
  ],
  "Attack on Titan": [
    { title: "Eldian History", query: "History of Ymir and the Titans" },
    { title: "The Basement Truth", query: "What was in the basement in Attack on Titan?" }
  ],
  "Elden Ring": [
    { title: "The Shattering", query: "What caused the Shattering in Elden Ring?" },
    { title: "Outer Gods", query: "Who are the Outer Gods in Elden Ring?" }
  ],
  "Batman": [
    { title: "The Joker's Origin", query: "The Joker's canon origin story" },
    { title: "Robin's Legacy", query: "History of the Robins in Batman" }
  ]
};

export function generateDiscoveryRails(
  contextPacket: ContextPacketShape,
  themeProfile: ThemeProfile
): DiscoveryRail[] {
  const rails: DiscoveryRail[] = [];
  const entity = contextPacket.canonicalEntity;
  const franchise = contextPacket.parentFranchise;

  // 1. Deeper Exploration (Franchise/Entity specific)
  // Show this first if we have specific lore dives
  const explorationKey = FRANCHISE_EXPLORATION[entity] ? entity : 
                         (franchise && FRANCHISE_EXPLORATION[franchise] ? franchise : null);
  
  if (explorationKey) {
    rails.push({
      id: "deep-dive",
      label: DISCOVERY_HEADERS.DEEP_DIVE.label,
      editorial: DISCOVERY_HEADERS.DEEP_DIVE.editorial,
      items: FRANCHISE_EXPLORATION[explorationKey].map(item => ({
        title: item.title,
        query: item.query,
        mood: themeProfile.visualMood
      }))
    });
  }

  // 2. Thematic Relatives
  if (THEMATIC_CONNECTIONS[entity]) {
    rails.push({
      id: "thematic",
      label: DISCOVERY_HEADERS.THEMATIC.label,
      editorial: DISCOVERY_HEADERS.THEMATIC.editorial,
      items: THEMATIC_CONNECTIONS[entity].map(item => ({
        title: item.title,
        subtitle: item.subtitle,
        query: item.query,
        mediaLens: item.lens,
        mood: themeProfile.visualMood
      }))
    });
  }

  // 3. Fallback / Generic Theme Rail (if we didn't have hardcoded connections but have themes)
  if (!THEMATIC_CONNECTIONS[entity] && themeProfile.themes.length > 0) {
    const primaryTheme = themeProfile.themes[0];
    // In a fully scaled system, we'd do a reverse-lookup here.
    // For 8E, we just provide a gentle generic push if we lack curated matches.
    rails.push({
      id: "thematic-generic",
      label: "Thematic Parallels",
      editorial: `Stories exploring ${primaryTheme}`,
      items: [
        {
          title: `Explore ${primaryTheme}`,
          subtitle: `Across ${contextPacket.mediaLens}`,
          query: `best ${contextPacket.mediaLens} about ${primaryTheme}`,
          mood: themeProfile.visualMood
        }
      ]
    });
  }

  return rails.slice(0, 3); // Max 3 rails to avoid overload
}
