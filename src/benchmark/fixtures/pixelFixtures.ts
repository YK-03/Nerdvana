/**
 * pixelFixtures.ts
 * Phase 8B: Controlled benchmark pixel fixtures (real image bytes, sandbox-only).
 * Minimal PNG patches for CLIP pixel embedding pressure tests.
 */

export interface PixelFixture {
  id: string;
  topologyTarget: string;
  label: string;
  /** Raw PNG bytes (base64 decoded) */
  bytes: Uint8Array;
  mimeType: "image/png";
}

/** 1x1 PNG pixels — valid PNG structure, distinct RGB values per fixture */
function png1x1(r: number, g: number, b: number): Uint8Array {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  const ihdr = new Uint8Array([
    0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0,
    144, 119, 83, 222,
  ]);
  const raw = new Uint8Array([0, r, g, b]);
  const len = raw.length;
  const chunk = new Uint8Array(12 + len + 4);
  chunk[0] = (len >> 24) & 255;
  chunk[1] = (len >> 16) & 255;
  chunk[2] = (len >> 8) & 255;
  chunk[3] = len & 255;
  chunk[4] = 73;
  chunk[5] = 68;
  chunk[6] = 65;
  chunk[7] = 84;
  raw.forEach((v, i) => {
    chunk[8 + i] = v;
  });
  const iend = new Uint8Array([
    0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
  ]);
  const out = new Uint8Array(signature.length + ihdr.length + chunk.length + iend.length);
  let o = 0;
  out.set(signature, o);
  o += signature.length;
  out.set(ihdr, o);
  o += ihdr.length;
  out.set(chunk, o);
  o += chunk.length;
  out.set(iend, o);
  return out;
}

export const PIXEL_FIXTURES: PixelFixture[] = [
  {
    id: "px-batman-dark",
    topologyTarget: "DC::Batman (DC Comics)",
    label: "dark vigilante silhouette",
    bytes: png1x1(20, 20, 30),
    mimeType: "image/png",
  },
  {
    id: "px-moon-knight",
    topologyTarget: "Marvel::Moon-Knight",
    label: "white armored vigilante",
    bytes: png1x1(240, 240, 245),
    mimeType: "image/png",
  },
  {
    id: "px-iron-man",
    topologyTarget: "Marvel::Iron-Man",
    label: "red gold armored hero",
    bytes: png1x1(200, 40, 30),
    mimeType: "image/png",
  },
  {
    id: "px-batman-beyond",
    topologyTarget: "DC::Batman::Beyond",
    label: "red suit futuristic batman",
    bytes: png1x1(180, 20, 20),
    mimeType: "image/png",
  },
  {
    id: "px-dante",
    topologyTarget: "Anime::DevilMayCry::Dante",
    label: "silver hair red coat swordsman",
    bytes: png1x1(200, 200, 210),
    mimeType: "image/png",
  },
  {
    id: "px-sephiroth",
    topologyTarget: "Anime::Sephiroth",
    label: "silver hair long sword",
    bytes: png1x1(190, 195, 220),
    mimeType: "image/png",
  },
];

const FIXTURE_BY_ID = new Map(PIXEL_FIXTURES.map((f) => [f.id, f]));
const FIXTURE_BY_QUERY: Record<string, string> = {
  "gotham dark armored vigilante": "px-batman-dark",
  "marvel dark armored vigilante": "px-moon-knight",
  "mcu masked billionaire hero": "px-iron-man",
  "batman beyond red suit hero": "px-batman-beyond",
  "anime silver-haired swordsman": "px-dante",
  "dark armored vigilante": "px-batman-dark",
  "masked billionaire hero": "px-iron-man",
  "silver-haired anime swordsman": "px-dante",
};

export function getPixelFixtureForQuery(query: string): PixelFixture | null {
  const id = FIXTURE_BY_QUERY[query.toLowerCase().trim()];
  if (!id) return null;
  return FIXTURE_BY_ID.get(id) ?? null;
}

export function getPixelFixtureById(id: string): PixelFixture | null {
  return FIXTURE_BY_ID.get(id) ?? null;
}
