import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { enrichAcademicianCache, parseCaeProfile, parseCasProfile } from "./lib/academician-profile.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const dataDir = path.join(root, "data");
const stablePath = path.join(dataDir, "chinese-academicians-cache.json");
const today = new Date().toISOString().slice(0, 10);
const snapshotPath = path.join(dataDir, `chinese-academicians-cache-${today}.json`);
const args = process.argv.slice(2);
const valueFor = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : fallback;
};
const concurrency = Number(valueFor("--concurrency", "8"));
const profileCachePath = path.resolve(valueFor("--profile-cache",
  path.join(dataDir, "chinese-academician-profile-cache.json")));
const resume = !args.includes("--no-resume");
const dryRun = args.includes("--dry-run");

const fetchText = async (url) => {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { redirect: "follow",
        headers: { "user-agent": "who-cite-your-works/2.0 (official academician profile cache)" },
        signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`${response.status} while fetching ${url}`);
      const html = await response.text();
      if (!/<html|<div|<p/i.test(html)) throw new Error(`Unexpected profile response from ${url}`);
      return html;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 300));
    }
  }
  throw lastError;
};

const cache = JSON.parse(await fs.readFile(stablePath, "utf8"));
const profileCache = JSON.parse(await fs.readFile(profileCachePath, "utf8").catch(() => '{"profiles":{}}'));
let lastReported = 0;
const result = await enrichAcademicianCache(cache, {
  priorProfiles: profileCache.profiles || {}, resume, verifiedOn: today, concurrency,
  fetchProfile: async (record) => {
    const html = await fetchText(record.officialProfileUrl);
    const profile = record.academy === "中国科学院"
      ? parseCasProfile(html, record.officialProfileUrl) : parseCaeProfile(html, record.officialProfileUrl);
    if (!profile.name) throw new Error(`Profile parser found no name: ${record.officialProfileUrl}`);
    return profile;
  },
  onProgress: ({ completed, total }) => {
    if (completed - lastReported >= 100 || completed === total) {
      lastReported = completed;
      process.stderr.write(`academician profiles ${completed}/${total}\n`);
    }
  },
});

if (!dryRun) {
  const profileJson = `${JSON.stringify({ schemaVersion: 1, verifiedOn: today,
    profiles: result.profiles }, null, 2)}\n`;
  const cacheJson = `${JSON.stringify(result.cache, null, 2)}\n`;
  const writes = [[profileCachePath, profileJson], [stablePath, cacheJson], [snapshotPath, cacheJson]];
  for (const [target, content] of writes) {
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp-${process.pid}`;
    await fs.writeFile(temporary, content);
    await fs.rename(temporary, target);
  }
}

console.log(JSON.stringify({ dryRun, stablePath, snapshotPath, profileCachePath,
  profileEnrichment: result.cache.profileEnrichment }, null, 2));
