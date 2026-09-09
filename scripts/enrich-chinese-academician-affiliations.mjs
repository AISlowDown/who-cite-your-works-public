import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { applyElectionAffiliations, parseAcademicianElectionTable,
  parseCasCandidatePublicLocationsText } from "./lib/academician-affiliations.mjs";

const execFileAsync = promisify(execFile);

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const dataDir = path.join(root, "data");
const stablePath = path.join(dataDir, "chinese-academicians-cache.json");
const today = new Date().toISOString().slice(0, 10);
const snapshotPath = path.join(dataDir, `chinese-academicians-cache-${today}.json`);
const dryRun = process.argv.includes("--dry-run");
const registry = JSON.parse(await fs.readFile(path.join(dataDir, "chinese-academician-affiliation-sources.json"), "utf8"));
const cache = JSON.parse(await fs.readFile(stablePath, "utf8"));
const fetchText = async (url) => {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(30000),
    headers: { "user-agent": "who-cite-your-works/1.0 (official academician affiliation cache)" } });
  if (!response.ok) throw new Error(`${response.status} while fetching ${url}`);
  return response.text();
};
const fetchPdfText = async (url) => {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(60000),
    headers: { "user-agent": "who-cite-your-works/1.0 (official academician affiliation cache)" } });
  if (!response.ok) throw new Error(`${response.status} while fetching ${url}`);
  const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), "citation-radar-cas-pdf-"));
  const pdfPath = path.join(temporaryDir, "source.pdf");
  try {
    await fs.writeFile(pdfPath, Buffer.from(await response.arrayBuffer()));
    return (await execFileAsync("pdftotext", ["-raw", pdfPath, "-"])).stdout;
  } finally { await fs.rm(temporaryDir, { recursive: true, force: true }); }
};

const evidence = [];
const sourceStatus = [];
for (const source of registry.sources) {
  if (source.sourceType === "candidate-list-html") {
    const eligible = new Set(cache.records.filter((record) => record.academy === source.academy
      && record.electionYear === source.electionYear && record.memberType === "院士").map((record) => record.name));
    const rows = parseAcademicianElectionTable(await fetchText(source.url), { academy: source.academy,
      electionYear: source.electionYear, sourceUrl: source.url }).filter((row) => eligible.has(row.name))
      .map((row) => ({ ...row, evidenceType: "work-unit-before-election" }));
    evidence.push(...rows);
    sourceStatus.push({ academy: source.academy, coverage: source.coverage, pageCount: 1, rowCount: rows.length });
    continue;
  }
  if (source.sourceType === "official-election-image-records") {
    const rows = (source.records || []).map((row) => ({ ...row, academy: source.academy,
      electionYear: source.electionYear, evidenceType: "work-unit-at-election", sourceUrl: source.url }));
    evidence.push(...rows);
    sourceStatus.push({ academy: source.academy, coverage: source.coverage, pageCount: 1, rowCount: rows.length });
    continue;
  }
  if (source.sourceType === "official-profile-record") {
    const rows = (source.records || []).map((row) => ({ ...row, academy: source.academy,
      electionYear: source.electionYear, evidenceType: "official-current-profile", sourceUrl: source.url }));
    evidence.push(...rows);
    sourceStatus.push({ academy: source.academy, coverage: source.coverage, pageCount: 1, rowCount: rows.length });
    continue;
  }
  if (source.sourceType === "candidate-public-locations-pdf") {
    const eligibleNames = cache.records.filter((record) => record.academy === source.academy
      && record.electionYear === source.electionYear && record.memberType === "院士").map((record) => record.name);
    const rows = parseCasCandidatePublicLocationsText(await fetchPdfText(source.url), eligibleNames)
      .map((row) => ({ ...row, academy: source.academy, electionYear: source.electionYear,
        evidenceType: "work-unit-before-election", sourceUrl: source.url }));
    evidence.push(...rows);
    sourceStatus.push({ academy: source.academy, coverage: source.coverage, pageCount: 1, rowCount: rows.length });
    continue;
  }
  const urls = [];
  if (source.indexUrl) {
    const indexHtml = await fetchText(source.indexUrl);
    for (const match of indexHtml.matchAll(/<a[^>]+href="([^"]+)"[^>]+title="((?:20(?:0[3-9]|1\d|2[13]))年中国科学院院士增选当选院士名单)"/g)) {
      urls.push({ url: new URL(match[1], source.indexUrl).href, electionYear: Number(match[2].slice(0, 4)) });
    }
  } else urls.push({ url: source.url, electionYear: source.electionYear });
  let rowCount = 0;
  for (const item of urls) {
    const rows = parseAcademicianElectionTable(await fetchText(item.url), { academy: source.academy,
      electionYear: item.electionYear, sourceUrl: item.url });
    evidence.push(...rows); rowCount += rows.length;
  }
  sourceStatus.push({ academy: source.academy, coverage: source.coverage, pageCount: urls.length, rowCount });
}

const output = applyElectionAffiliations(cache, evidence, today);
output.affiliationEnrichment.sources = sourceStatus;
if (!dryRun) {
  const content = `${JSON.stringify(output, null, 2)}\n`;
  await fs.writeFile(stablePath, content);
  await fs.writeFile(snapshotPath, content);
}
console.log(JSON.stringify({ dryRun, stablePath, snapshotPath, affiliationEnrichment: output.affiliationEnrichment }, null, 2));
