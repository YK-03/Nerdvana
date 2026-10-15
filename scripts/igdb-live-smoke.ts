import { fetchVerifiedIgdbGame } from "../src/server/igdbGame.ts";

const clientId = process.env.IGDB_CLIENT_ID?.trim();
const clientSecret = process.env.IGDB_CLIENT_SECRET?.trim();

if (process.env.RUN_IGDB_LIVE_SMOKE !== "true") {
  console.error("Refusing live IGDB request. Set RUN_IGDB_LIVE_SMOKE=true to run this opt-in smoke check.");
  process.exitCode = 1;
} else if (!clientId || !clientSecret) {
  console.error("IGDB live smoke check cannot run: required IGDB credentials are not configured.");
  process.exitCode = 1;
} else {
  const providerId = process.argv[2] || "igdb::game::28552";
  const expectedTitle = process.argv[3] || "Far Cry 5";
  const baseInput = { providerId, expectedTitle, clientId, clientSecret, correlationId: "igdb-live-smoke" };
  const variants = ["full", "identity", "summary", "characters", "characterDescriptions", "characterImages"] as const;
  const results = [];
  for (const queryVariant of variants) {
    results.push(await fetchVerifiedIgdbGame({ ...baseInput, queryVariant }));
  }

  for (const [variant, result] of variants.map((variant, index) => [variant, results[index]] as const)) {
    if (!result.game) {
      console.error("IGDB live smoke check failed", {
        variant,
        provider: "igdb",
        category: result.failureCode,
        httpStatus: result.httpStatus ?? null,
        attempts: result.attempts,
        message: result.providerMessage ?? null,
      });
    } else {
      console.log("IGDB live smoke check passed", {
        variant,
        provider: "igdb",
        providerId,
        returnedId: result.game.id ?? null,
        title: result.game.name ?? null,
        httpStatus: result.httpStatus ?? null,
        attempts: result.attempts,
      });
    }
  }

  if (!results[0].game || !results[1].game) process.exitCode = 1;
}
