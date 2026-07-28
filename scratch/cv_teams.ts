import fs from "fs";

const envStr = fs.readFileSync(".env", "utf8");
for (const line of envStr.split("\n")) {
  if (line.includes("=")) {
    const [key, val] = line.split("=");
    process.env[key.trim()] = val.trim();
  }
}

const key = process.env.VITE_COMICVINE_API_KEY || process.env.COMICVINE_API_KEY;
const queries = ["Avengers", "Justice League", "X-Men", "Guardians of the Galaxy"];

async function measure(strategyName: string, resources: string) {
  console.log(`\n--- ${strategyName} ---`);
  for (const q of queries) {
    const encQuery = encodeURIComponent(q);
    const url = `https://comicvine.gamespot.com/api/search/?api_key=${key}&query=${encQuery}&resources=${resources}&field_list=id,name,start_year,publisher,resource_type,issue_number&format=json&limit=5`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Nerdvana/1.0" } });
      const data = await res.json();
      const results = data.results?.map((r: any) => `${r.name} (${r.resource_type})`).join(", ") || "None";
      console.log(`${q}: ${results}`);
    } catch(e) {
      console.log(`${q}: ERROR`);
    }
    // slight delay
    await new Promise(r => setTimeout(r, 1000));
  }
}

async function run() {
  await measure("Balanced (volume, story_arc, character)", "volume,story_arc,character");
  await measure("With Teams (volume, story_arc, character, team)", "volume,story_arc,character,team");
}

run();
