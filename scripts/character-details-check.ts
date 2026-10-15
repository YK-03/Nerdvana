import assert from "node:assert/strict";
import {
  formatCharacterDescription,
  getCharacterDetailContent,
} from "../src/lib/characterDescription.ts";
import {
  extractAnilistCharacters,
  extractTmdbCharacters,
} from "../src/lib/resolver/exploration/characterExtractor.ts";

const animeDescription = "**Species:** Human **Height:** 172 cm\n__Affiliations:__ Straw Hat Pirates";
const formatted = formatCharacterDescription(animeDescription);

assert.equal(formatted.summary, null);
assert.deepEqual(formatted.attributes, [
  { label: "Species", value: "Human" },
  { label: "Height", value: "172 cm" },
  { label: "Affiliations", value: "Straw Hat Pirates" },
]);
assert.equal(JSON.stringify(formatted).includes("**"), false);

const longAnimeDescription = [
  "Doctor Kenzo Tenma is a Japanese neurosurgeon working at the Eisler Memorial Hospital in Düsseldorf.",
  "At the beginning of Monster he is favored by his colleagues.",
  "He later speaks with [Dieter](https://anilist.co/character/719/Dieter) and [Tenma](https://anilist.co/character/718/Tenma-Kenzou).",
  "The text after the final link remains available.",
  "**Species:** Human",
  "__Affiliations:__ Eisler Memorial Hospital",
].join("\n\n");

const extractedAnime = extractAnilistCharacters({
  characters: {
    edges: [{
      role: "MAIN",
      node: {
        id: 718,
        name: { full: "Kenzo Tenma" },
        description: longAnimeDescription,
        image: { large: "https://images.example/tenma.jpg" },
      },
    }],
  },
});
assert.ok((extractedAnime[0]?.description?.length ?? 0) > 150);
const extractedContent = getCharacterDetailContent(extractedAnime[0]?.description, false, "anime", true);
assert.match(extractedContent.summary ?? "", /Düsseldorf/);
assert.match(extractedContent.summary ?? "", /Dieter/);
assert.match(extractedContent.summary ?? "", /The text after the final link remains available/);
assert.doesNotMatch(extractedContent.summary ?? "", /https:\/\//);
assert.deepEqual(extractedContent.attributes, [
  { label: "Species", value: "Human" },
  { label: "Affiliations", value: "Eisler Memorial Hospital" },
]);

assert.deepEqual(formatCharacterDescription("Unmatched **marker and [label](https://example.com) after"), {
  summary: "Unmatched marker and label after",
  attributes: [],
});
assert.deepEqual(formatCharacterDescription(null), { summary: null, attributes: [] });

assert.deepEqual(formatCharacterDescription(undefined), { summary: null, attributes: [] });
assert.deepEqual(getCharacterDetailContent(animeDescription, false, "anime"), { summary: null, attributes: [] });
assert.deepEqual(getCharacterDetailContent(animeDescription, false, "anime", true), formatted);
assert.deepEqual(getCharacterDetailContent(animeDescription, true, "anime"), formatted);
for (const mediaLens of ["movies", "tv", "games", "comics"]) {
  assert.deepEqual(
    getCharacterDetailContent(animeDescription, false, mediaLens),
    { summary: null, attributes: [] },
    `${mediaLens} descriptions remain gated when spoilers are off`,
  );
  assert.deepEqual(
    getCharacterDetailContent(animeDescription, true, mediaLens),
    formatted,
    `${mediaLens} descriptions remain available when spoilers are on`,
  );
}

// The dialog tracks the revealed character by ID, so a different character or a
// newly mounted dialog cannot inherit a prior character's reveal state.
assert.deepEqual(
  getCharacterDetailContent(animeDescription, false, "anime", "anime::other" === "anime::718"),
  { summary: null, attributes: [] },
);
assert.deepEqual(
  getCharacterDetailContent(animeDescription, false, "anime", "anime::718" === "anime::718"),
  formatted,
);
assert.deepEqual(
  getCharacterDetailContent(animeDescription, false, "anime", false),
  { summary: null, attributes: [] },
  "a reopened dialog starts with the anime description hidden",
);

const tmdbCharacters = extractTmdbCharacters({
  credits: {
    cast: [{ id: 123, character: "Mia Wallace", name: "Uma Thurman", profile_path: "/uma.jpg", order: 0 }],
  },
});
assert.equal(tmdbCharacters[0]?.name, "Mia Wallace");
assert.equal(tmdbCharacters[0]?.portrayedBy, "Uma Thurman");
assert.equal(tmdbCharacters[0]?.description, undefined);

console.log("Character detail formatting checks passed.");
