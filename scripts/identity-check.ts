import assert from "node:assert/strict";
import {
  fallbackIdentityMatches,
  isGenericMediaLabel,
  normalizeEntityTitle,
  titlesReferToSameEntity,
} from "../src/lib/resolver/entityIdentity.js";

// One Piece: a Jikan timeout must not authorize the generic "Anime" label to
// select an unrelated AniList result such as Anime-Gataris.
assert.equal(isGenericMediaLabel("Anime", "anime"), true);
assert.equal(fallbackIdentityMatches("Anime", "Anime-Gataris", "anime"), false);
assert.equal(fallbackIdentityMatches("One Piece", "Anime-Gataris", "anime"), false);
assert.equal(fallbackIdentityMatches("One Piece", "One Piece", "anime"), true);

// Batman: a selected movie must remain distinct from the broader franchise.
assert.equal(titlesReferToSameEntity("The Batman", "The Batman"), true);
assert.equal(titlesReferToSameEntity("The Batman", "Batman"), false);
assert.equal(fallbackIdentityMatches("Batman", "Batman DC Comics", "comics"), false);

// A provider returning no result cannot establish identity.
assert.equal(fallbackIdentityMatches("One Piece", "", "anime"), false);
assert.equal(fallbackIdentityMatches("One Piece", null, "anime"), false);

// A same-entity cross-provider result remains valid when its canonical title
// is preserved, while an unrelated provider result is rejected.
assert.equal(fallbackIdentityMatches("One Piece", "One Piece", "anime", ["ワンピース"]), true);
assert.equal(fallbackIdentityMatches("One Piece", "Anime-Gataris", "anime"), false);

// Identity normalization is deterministic but does not collapse specific
// titles into broader franchise labels.
assert.equal(normalizeEntityTitle("One-Piece"), "one piece");
assert.equal(normalizeEntityTitle("The Batman"), "the batman");

console.log("Phase 1B identity checks passed.");
