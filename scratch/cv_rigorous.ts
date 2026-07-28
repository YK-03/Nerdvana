import fs from "fs";
import { performance } from "perf_hooks";

const envStr = fs.readFileSync(".env", "utf8");
for (const line of envStr.split("\n")) {
  if (line.includes("=")) {
    const [key, val] = line.split("=");
    process.env[key.trim()] = val.trim();
  }
}

const key = process.env.VITE_COMICVINE_API_KEY || process.env.COMICVINE_API_KEY;
const queries = ["Batman", "Secret Wars", "Spider-Man", "Crisis", "X-Men"];
const ITERATIONS = 5; // 5 queries x 5 iterations = 25 requests per strategy

const TIMEOUT_MS = 2500;

interface BenchmarkResult {
  times: number[];
  timeouts: number;
  results: string[][]; // top 3 names from each query
}

async function fetchWithTimeout(url: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  
  const start = performance.now();
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Nerdvana/1.0" }, signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) return { error: true };
    const data = await res.json();
    return { time: performance.now() - start, names: data.results?.slice(0,5).map((r: any) => `${r.name} (${r.resource_type})`) || [] };
  } catch (err: any) {
    if (err.name === 'AbortError' || err.message.includes('timeout') || err.message.includes('aborted')) {
      return { timeout: true };
    }
    return { error: true };
  }
}

async function runBenchmark(name: string, resources: string) {
  console.log(`\n--- Benchmarking: ${name} ---`);
  const metrics: BenchmarkResult = { times: [], timeouts: 0, results: [] };
  
  for (const q of queries) {
    console.log(`Query: ${q}`);
    const encQuery = encodeURIComponent(q);
    const url = `https://comicvine.gamespot.com/api/search/?api_key=${key}&query=${encQuery}&resources=${resources}&field_list=id,name,start_year,publisher,resource_type,issue_number&format=json&limit=12`;
    
    // Warmup
    await fetchWithTimeout(url);

    let queryResults: string[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const res = await fetchWithTimeout(url);
      if (res.timeout) {
        metrics.timeouts++;
      } else if (!res.error) {
        metrics.times.push(res.time!);
        if (queryResults.length === 0) queryResults = res.names!;
      }
      // slight delay to avoid rate limit bans
      await new Promise(r => setTimeout(r, 1000));
    }
    metrics.results.push(queryResults);
  }
  
  metrics.times.sort((a, b) => a - b);
  const avg = metrics.times.reduce((a, b) => a + b, 0) / (metrics.times.length || 1);
  const p95 = metrics.times[Math.floor(metrics.times.length * 0.95)] || 0;
  const timeoutRate = (metrics.timeouts / (queries.length * ITERATIONS)) * 100;
  
  console.log(`Avg: ${avg.toFixed(2)}ms`);
  console.log(`P95: ${p95.toFixed(2)}ms`);
  console.log(`Timeout Rate: ${timeoutRate.toFixed(2)}%`);
  console.log(`Top 5 Results per query:`);
  queries.forEach((q, idx) => {
    console.log(`  ${q}: ${metrics.results[idx]?.join(", ")}`);
  });
}

async function run() {
  await runBenchmark("Legacy Strategy (6 resources)", "character,volume,issue,story_arc,team,publisher");
  await runBenchmark("Lean Strategy (volume, story_arc)", "volume,story_arc");
  await runBenchmark("Balanced Strategy (volume, story_arc, character)", "volume,story_arc,character");
}

run();
