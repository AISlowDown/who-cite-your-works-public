import fs from "node:fs/promises";

const root = process.env.CITATION_RADAR_WORKSPACE || process.cwd();
const [reportPath, markdownPath] = process.argv.slice(2);
if (!reportPath || !markdownPath) {
  throw new Error("Usage: node scripts/refresh-citation-comments.mjs <citation-records.json> <citation-report.md>");
}
const report = JSON.parse(await fs.readFile(reportPath, "utf8"));
const markdown = await fs.readFile(markdownPath, "utf8");

const curatedComments = new Map();
for (const line of markdown.split(/\r?\n/)) {
  const cells = line.split("|");
  const index = Number(cells[1]?.trim());
  const commentCell = cells[6]?.trim() || "";
  const match = commentCell.match(/^\u539f\u6587\uff1a([\s\S]*?)<br>\u603b\u7ed3\uff1a([\s\S]*?)<br>\u5206\u7c7b\uff1a([\s\S]*)$/);
  if (Number.isFinite(index) && match && match[1] !== "\u672a\u53d6\u5f97") {
    curatedComments.set(index, { excerpt: match[1], summaryZh: match[2], usageCategory: match[3] });
  }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const normalizeDoi = (value = "") => value.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim().toLowerCase();
const normalizeTitle = (value = "") => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const shortExcerpt = (contexts = []) => {
  const text = contexts.find((value) => String(value).trim())?.trim() || "";
  return contexts.filter((value) => String(value).trim()).join("\n\n");
};

const classifyUsage = (citation) => {
  const intents = (citation.intents || []).map((value) => String(value).toLowerCase());
  const context = (citation.contexts || []).join(" ").toLowerCase();
  if (intents.includes("methodology") || /\b(method|model|framework|algorithm|approach|proposed|developed)\b/.test(context)) {
    return ["方法/技术依据", "该引用将你的研究作为方法、模型或技术路径的相关依据。"];
  }
  if (intents.includes("result") || /\b(result|found|showed|demonstrated|confirmed|outperform)\b/.test(context)) {
    return ["结果支持/比较", "该引用将你的研究结果用于支持、比较或讨论相关结论。"];
  }
  return ["背景/相关工作", "该引用将你的研究作为研究背景、技术现状或相关工作的依据。"];
};

const fetchJson = async (url) => {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(url, { headers: { "user-agent": "who-cite-your-works/1.0" } });
    if (response.ok) return response.json();
    if (response.status === 429 && attempt < 4) {
      await wait(attempt * 5000);
      continue;
    }
    throw new Error(`${response.status} ${await response.text()}`);
  }
  throw new Error("Semantic Scholar request failed after retries");
};

const targetDois = [...new Set(report.records.map((record) => normalizeDoi(record.userWork?.doi)).filter(Boolean))];
const citationsByTargetDoi = new Map();
const failures = [];
for (const doi of targetDois) {
  const encodedId = encodeURIComponent(`DOI:${doi}`);
  const url = `https://api.semanticscholar.org/graph/v1/paper/${encodedId}/citations?fields=contexts,intents,isInfluential,title,externalIds&limit=1000`;
  try {
    const { fetchCitationPages } = await import('./lib/citation-deep-dive.mjs');
    const payload = await fetchCitationPages(doi, fetchJson);
    citationsByTargetDoi.set(doi, payload.data);
    if (!payload.complete) failures.push({ doi, error: payload.error });
  } catch (error) {
    failures.push({ doi, error: String(error.message || error) });
  }
  await wait(1100);
}

let matched = 0;
let contextsAvailable = 0;
let newlyAvailable = 0;
for (const [recordIndex, record] of report.records.entries()) {
  const targetDoi = normalizeDoi(record.userWork?.doi);
  const candidates = citationsByTargetDoi.get(targetDoi) || [];
  const citingDoi = normalizeDoi(record.citingWork?.doi);
  const citingTitle = normalizeTitle(record.citingWork?.title);
  const citation = candidates.find((item) => normalizeDoi(item.citingPaper?.externalIds?.DOI) === citingDoi && citingDoi)
    || candidates.find((item) => normalizeTitle(item.citingPaper?.title) === citingTitle && citingTitle);
  if (!citation) continue;
  matched += 1;
  const excerpt = shortExcerpt(citation.contexts);
  const hadContext = record.citationComment?.contextAvailable === true;
  const [usageCategory, summaryZh] = classifyUsage(citation);
  // Row-number joins are not stable across reordered reports. Keep existing JSON
  // evidence instead of importing a potentially unrelated Markdown row.
  const curated = undefined;
  if (record.citationComment?.contextAvailable && record.citationComment?.excerpt) {
    record.citationComment.lastRefresh = { retrievedAt: new Date().toISOString(), status: excerpt ? 'new_candidate_preserved_existing' : 'empty_preserved_existing', candidateExcerpt: excerpt || null };
    continue;
  }
  record.citationComment = {
    source: "Semantic Scholar citation contexts",
    sourcePaperId: citation.citingPaper?.paperId || record.citationComment?.sourcePaperId || null,
    contextAvailable: Boolean(excerpt || curated?.excerpt),
    verified: false,
    status: 'context_requires_review',
    excerpt: excerpt || curated?.excerpt || null,
    location: (excerpt || curated?.excerpt) ? "Semantic Scholar 未提供章节/页码" : null,
    intents: citation.intents || [],
    isInfluential: citation.isInfluential === true,
    usageCategory: excerpt ? (curated?.usageCategory || usageCategory) : "用途待人工判定",
    summaryZh: excerpt ? (curated?.summaryZh || summaryZh) : "引用关系已确认，但引用原因暂不可判定。",
  };
  if (excerpt) {
    contextsAvailable += 1;
    if (!hadContext) newlyAvailable += 1;
  }
}

report.metadata ||= {};
contextsAvailable = report.records.filter(record => record.citationComment?.contextAvailable && record.citationComment?.excerpt).length;
report.metadata.commentRetrieval = {
  source: "Semantic Scholar citation contexts",
  targetPapersQueried: targetDois.length,
  targetPapersSucceeded: citationsByTargetDoi.size,
  matchedReportScenarios: matched,
  contextsAvailable,
  newlyAvailable,
  failures,
  retrievedAt: new Date().toISOString(),
};

await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ reportPath, targets: targetDois.length, succeeded: citationsByTargetDoi.size, matched, contextsAvailable, newlyAvailable, failures }, null, 2));
