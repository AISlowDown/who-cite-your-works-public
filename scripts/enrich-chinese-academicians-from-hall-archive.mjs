import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { parseAcademicianHallText } from "./lib/academician-profile.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const dataDir = path.join(root, "data");
const stablePath = path.join(dataDir, "chinese-academicians-cache.json");
const archiveCachePath = path.join(dataDir, "chinese-academician-hall-archive-cache.json");
const today = new Date().toISOString().slice(0, 10);
const snapshotPath = path.join(dataDir, `chinese-academicians-cache-${today}.json`);
const dryRun = process.argv.includes("--dry-run");
const cdxFiles = process.argv.flatMap((value, index, values) => value === "--cdx-file" && values[index + 1]
  ? [path.resolve(values[index + 1])] : []);
const indexes = ["CC-MAIN-2025-30", "CC-MAIN-2023-40", "CC-MAIN-2022-40", "CC-MAIN-2021-43", "CC-MAIN-2020-40"];
const uniq = (values) => [...new Set(values.filter(Boolean).map((value) => String(value).trim()))];
const normalizeName = (value = "") => String(value).normalize("NFKC").replace(/[\s·.•\-_'’]/g, "").toLowerCase();

const fetchJsonLines = async (index) => {
  const url = new URL(`https://index.commoncrawl.org/${index}-index`);
  url.searchParams.set("url", "ysg.ckcest.cn/share/*/baseInfo");
  url.searchParams.set("output", "json");
  url.searchParams.set("filter", "status:200");
  url.searchParams.set("collapse", "urlkey");
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(90000) });
      if (response.status === 404) return [];
      if (!response.ok) throw new Error(`${response.status} while fetching ${url}`);
      return (await response.text()).split("\n").flatMap((line) => {
        try { return line.trim() ? [JSON.parse(line)] : []; } catch { return []; }
      });
    } catch (error) { lastError = error; }
  }
  throw lastError;
};

const archiveCaptures = async () => {
  const byUrl = new Map();
  const sources = cdxFiles.length ? await Promise.all(cdxFiles.map(async (file) => ({
    index: path.basename(file).match(/CC-MAIN-\d{4}-\d{2}/)?.[0] || "local-cdx",
    rows: (await fs.readFile(file, "utf8")).split("\n").flatMap((line) => {
      try { return line.trim() ? [JSON.parse(line)] : []; } catch { return []; }
    }),
  }))) : await Promise.all(indexes.map(async (index) => {
    try { return { index, rows: await fetchJsonLines(index) }; }
    catch (error) { process.stderr.write(`archive index skipped ${index}: ${error.message}\n`); return { index, rows: [] }; }
  }));
  for (const { index, rows } of sources) {
    for (const item of rows) {
      if (!/\/share\/\d+\/baseInfo$/i.test(item.url) || item.mime !== "application/pdf") continue;
      const existing = byUrl.get(item.url);
      if (!existing || item.timestamp > existing.timestamp) byUrl.set(item.url, { ...item, index });
    }
  }
  return [...byUrl.values()];
};

const fetchArchivedPdf = async (capture) => {
  const start = Number(capture.offset);
  const end = start + Number(capture.length) - 1;
  const archiveUrl = `https://data.commoncrawl.org/${capture.filename}`;
  const response = await fetch(archiveUrl, { headers: { range: `bytes=${start}-${end}` },
    signal: AbortSignal.timeout(90000) });
  if (!response.ok && response.status !== 206) throw new Error(`${response.status} while fetching ${archiveUrl}`);
  const warc = gunzipSync(Buffer.from(await response.arrayBuffer()));
  const offset = warc.indexOf(Buffer.from("%PDF-"));
  if (offset < 0) throw new Error(`No PDF payload in ${capture.url}`);
  return warc.subarray(offset);
};

const textFromPdf = async (pdf, temporaryDir, index) => {
  const pdfPath = path.join(temporaryDir, `${index}.pdf`);
  await fs.writeFile(pdfPath, pdf);
  const { stdout } = await execFileAsync("pdftotext", ["-layout", pdfPath, "-"]);
  return stdout;
};

const cache = JSON.parse(await fs.readFile(stablePath, "utf8"));
const prior = JSON.parse(await fs.readFile(archiveCachePath, "utf8").catch(() => '{"profiles":{}}'));
const captures = await archiveCaptures();
const profiles = { ...(prior.profiles || {}) };
const temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), "citation-radar-academicians-"));
let cursor = 0;
let fetched = 0;
let failed = 0;
try {
  const worker = async () => {
    while (cursor < captures.length) {
      const index = cursor++;
      const capture = captures[index];
      if (profiles[capture.url]?.timestamp === capture.timestamp) continue;
      try {
        const text = await textFromPdf(await fetchArchivedPdf(capture), temporaryDir, index);
        const profile = parseAcademicianHallText(text, capture.url);
        if (!profile.name) throw new Error("No name parsed from official hall PDF");
        profiles[capture.url] = { status: "success", timestamp: capture.timestamp,
          capturedOn: `${capture.timestamp.slice(0, 4)}-${capture.timestamp.slice(4, 6)}-${capture.timestamp.slice(6, 8)}`,
          archiveIndex: capture.index, archiveFilename: capture.filename, profile };
        fetched += 1;
      } catch (error) {
        profiles[capture.url] = { status: "failed", timestamp: capture.timestamp, error: error.message };
        failed += 1;
      }
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
} finally {
  await fs.rm(temporaryDir, { recursive: true, force: true });
}

const candidates = new Map();
for (const [index, record] of cache.records.entries()) {
  const key = normalizeName(record.name);
  const values = candidates.get(key) || [];
  values.push(index); candidates.set(key, values);
}
let matchedProfiles = 0;
let ambiguousProfiles = 0;
const byRecord = new Map();
for (const entry of Object.values(profiles)) {
  if (entry.status !== "success") continue;
  const profile = entry.profile;
  let indexesForName = candidates.get(normalizeName(profile.name)) || [];
  if (profile.electionYear) indexesForName = indexesForName.filter((index) =>
    !cache.records[index].electionYear || cache.records[index].electionYear === profile.electionYear);
  const academy = /\u4e2d\u56fd\u5de5\u7a0b\u9662/.test(profile.profileText) ? "中国工程院"
    : /\u4e2d\u56fd\u79d1\u5b66\u9662/.test(profile.profileText) ? "中国科学院" : null;
  if (academy) indexesForName = indexesForName.filter((index) => cache.records[index].academy === academy);
  if (indexesForName.length !== 1) { if (indexesForName.length > 1) ambiguousProfiles += 1; continue; }
  byRecord.set(indexesForName[0], entry); matchedProfiles += 1;
}

const records = cache.records.map((record, index) => {
  const entry = byRecord.get(index);
  if (!entry) return record;
  const profile = entry.profile;
  const affiliations = uniq(profile.careerAffiliations || []);
  const evidence = affiliations.map((affiliation) => ({ affiliation,
    evidenceType: (profile.sourceDateAffiliations || []).includes(affiliation)
      ? "ongoing-at-archived-source" : "career-history",
    sourceUrl: profile.sourceUrl, capturedOn: entry.capturedOn,
    archiveIndex: entry.archiveIndex, verifiedOn: today }));
  const encoded = uniq([...(record.affiliationEvidence || []).map(JSON.stringify), ...evidence.map(JSON.stringify)]);
  return { ...record, electionYear: record.electionYear || profile.electionYear || null,
    listedAffiliations: uniq([...(record.listedAffiliations || []), ...affiliations]),
    currentAffiliations: record.currentAffiliations || [],
    currentAtSourceAffiliations: uniq([...(record.currentAtSourceAffiliations || []),
      ...(profile.sourceDateAffiliations || [])]),
    careerAffiliations: uniq([...(record.careerAffiliations || []), ...affiliations]),
    affiliationEvidence: encoded.map(JSON.parse) };
});
const affiliationCount = records.filter((record) => record.listedAffiliations?.length).length;
const output = { ...cache, verifiedOn: today, records, hallArchiveEnrichment: { verifiedOn: today,
  source: "中国工程院院士馆官方页面的 Common Crawl 公开快照", captures: captures.length,
  cachedProfiles: Object.values(profiles).filter((entry) => entry.status === "success").length,
  fetched, failed, matchedProfiles, ambiguousProfiles, affiliationCount,
  currentFieldPolicy: "快照中无结束年月的任职只写入 currentAtSourceAffiliations，不写入 currentAffiliations" } };

if (!dryRun) {
  await fs.writeFile(archiveCachePath, `${JSON.stringify({ schemaVersion: 1, verifiedOn: today, profiles }, null, 2)}\n`);
  const content = `${JSON.stringify(output, null, 2)}\n`;
  await fs.writeFile(stablePath, content);
  await fs.writeFile(snapshotPath, content);
}
console.log(JSON.stringify({ dryRun, captures: captures.length, cachedProfiles: output.hallArchiveEnrichment.cachedProfiles,
  fetched, failed, matchedProfiles, ambiguousProfiles, affiliationCount }, null, 2));
