import fs from "fs";

const envStr = fs.readFileSync(".env", "utf8");
for (const line of envStr.split("\n")) {
  if (line.includes("=")) {
    const [key, val] = line.split("=");
    process.env[key.trim()] = val.trim();
  }
}

const key = process.env.VITE_COMICVINE_API_KEY || process.env.COMICVINE_API_KEY;

async function measure(name: string, url: string) {
  console.log(`\n--- Measuring: ${name} ---`);
  console.log(`URL: ${url.replace(key!, "HIDDEN")}`);
  
  const start = Date.now();
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Nerdvana/1.0" } });
    const end = Date.now();
    if (!res.ok) {
      console.log(`Failed with status ${res.status}`);
      return;
    }
    const data = await res.json();
    console.log(`Time: ${end - start}ms`);
    console.log(`Results length: ${data.results?.length}`);
  } catch (err: any) {
    console.log(`Error: ${err.message}`);
  }
}

async function run() {
  const query = "Secret Wars";
  const encQuery = encodeURIComponent(query);
  
  // 1. Current Search Endpoint
  const url1 = `https://comicvine.gamespot.com/api/search/?api_key=${key}&query=${encQuery}&resources=character,volume,issue,story_arc,team,publisher&field_list=id,name,start_year,publisher,resource_type,issue_number&format=json&limit=12`;
  await measure("Current Search Endpoint (6 resources)", url1);
  
  // 2. Search Endpoint (Only volume, story_arc)
  const url2 = `https://comicvine.gamespot.com/api/search/?api_key=${key}&query=${encQuery}&resources=volume,story_arc&field_list=id,name,start_year,publisher,resource_type&format=json&limit=12`;
  await measure("Reduced Search Endpoint (volume, story_arc)", url2);

  // 3. Volumes Endpoint direct filter
  const url3 = `https://comicvine.gamespot.com/api/volumes/?api_key=${key}&filter=name:${encQuery}&field_list=id,name,start_year,publisher&format=json&limit=10`;
  await measure("Volumes Endpoint", url3);
  
  // 4. Issues Endpoint direct filter
  const url4 = `https://comicvine.gamespot.com/api/issues/?api_key=${key}&filter=name:${encQuery}&field_list=id,name,issue_number,volume&format=json&limit=10`;
  await measure("Issues Endpoint", url4);
}

run();
