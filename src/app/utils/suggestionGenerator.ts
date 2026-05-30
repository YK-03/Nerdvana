import { ThemeProfile } from "../../lib/experience/themeEngine";

export function generateFollowUps(
    answerText: string,
    entity: string | null,
    franchise: string | null,
    mediaLens: string,
    themeProfile: ThemeProfile | null
): string[] {
    const text = answerText.toLowerCase();
    const suggestions: string[] = [];

    // Entity-aware suggestions
    if (entity) {
        if (text.includes("canon") || text.includes("timeline")) {
            suggestions.push(`How does ${entity} fit into the official timeline?`);
        }
        if (text.includes("ending") || text.includes("death")) {
            suggestions.push(`What happens after ${entity}?`);
        }
    }

    // Franchise-aware suggestions
    if (franchise && franchise !== entity) {
        suggestions.push(`How does this connect to the ${franchise} universe?`);
    }

    // Theme & Archetype-aware suggestions
    if (themeProfile) {
        if (themeProfile.themes.includes("time travel") || themeProfile.themes.includes("time dilation")) {
            suggestions.push("How does the timeline actually work?");
        }
        if (themeProfile.archetypes.includes("unreliable narrator")) {
            suggestions.push("Can we trust this perspective?");
        }
        if (themeProfile.themes.includes("multiverse")) {
            suggestions.push("How do the alternate universes connect?");
        }
        if (themeProfile.archetypes.includes("unlikely hero") || themeProfile.archetypes.includes("reluctant hero")) {
            suggestions.push("What motivates their decisions?");
        }
    }

    // Fallbacks if few suggestions found (Editorial, not robotic)
    if (suggestions.length < 2) {
        suggestions.push("Is there a deeper meaning here?");
        if (mediaLens === "movies" || mediaLens === "tv") {
            suggestions.push("Did the creators confirm this?");
        } else if (mediaLens === "anime" || mediaLens === "comics") {
            suggestions.push("Does the original source material differ?");
        } else {
            suggestions.push("Are there alternate interpretations?");
        }
    }

    if (suggestions.length < 3) {
        suggestions.push("What are the most popular fan theories?");
    }

    // Return top 3-4 unique suggestions
    return Array.from(new Set(suggestions)).slice(0, 4);
}
