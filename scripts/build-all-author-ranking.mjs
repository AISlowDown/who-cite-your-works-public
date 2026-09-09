import fs from "node:fs/promises";
import path from "node:path";
import { resolveCitingArticleAffiliations } from "./lib/author-affiliation.mjs";
import { hasStrictPriorityAffiliation } from "./lib/institution-scope.mjs";

const root = process.env.CITATION_RADAR_WORKSPACE || process.cwd();
const [sourcePath, outputPath, institutionCachePath] = process.argv.slice(2);
if (!sourcePath || !outputPath || !institutionCachePath) {
  throw new Error("Usage: node scripts/build-all-author-ranking.mjs <citation-records.json> <output.json> <institution-cache.json>");
}
const institutionCache = JSON.parse(await fs.readFile(institutionCachePath, "utf8"));
const source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const authors = new Map();

for (const record of source.records) {
  for (const author of record.noteworthyAuthors || []) {
    if ((author.citedByCount || 0) <= 2000 || !hasStrictPriorityAffiliation(author, institutionCache)) continue;
    const key = author.openalexId || author.name;
    const item = authors.get(key) || {
      name: author.name, openalexId: author.openalexId || "", citedByCount: 0, hIndex: 0,
      scenarioCount: 0, firstAuthorScenarios: 0, correspondingAuthorScenarios: 0,
      existingCoauthor: false, paperAffiliations: new Set(), affiliationEvidenceSources: new Set(),
      affiliationEvidenceUrls: new Set(), userPapers: new Set(), citingPapers: new Set(),
    };
    item.citedByCount = Math.max(item.citedByCount, author.citedByCount || 0);
    item.hIndex = Math.max(item.hIndex, author.hIndex || 0);
    item.scenarioCount += 1;
    if (author.position === 1) item.firstAuthorScenarios += 1;
    if (author.corresponding === true) item.correspondingAuthorScenarios += 1;
    item.existingCoauthor ||= author.existingCoauthor === true;
    const affiliationEvidence = resolveCitingArticleAffiliations(author);
    affiliationEvidence.affiliations.forEach((value) => item.paperAffiliations.add(value));
    item.affiliationEvidenceSources.add(affiliationEvidence.sourceType);
    if (affiliationEvidence.sourceUrl) item.affiliationEvidenceUrls.add(affiliationEvidence.sourceUrl);
    if (record.userWork?.title) item.userPapers.add(record.userWork.title);
    if (record.citingWork?.title) item.citingPapers.add(record.citingWork.title);
    authors.set(key, item);
  }
}

const ranked = [...authors.values()]
  .sort((a, b) => b.citedByCount - a.citedByCount || a.name.localeCompare(b.name))
  .map((author, index) => ({
    ...author, rank: index + 1,
    paperAffiliations: [...author.paperAffiliations].sort(),
    affiliationEvidenceSources: [...author.affiliationEvidenceSources].sort(),
    affiliationEvidenceUrls: [...author.affiliationEvidenceUrls].sort(),
    userPapers: [...author.userPapers].sort(),
    citingPapers: [...author.citingPapers].sort(),
  }));

const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  rule: "纳入全部署名作者：总被引严格大于2000，论文署名机构属国内985/211/第二轮双一流或港澳台及国外QS前200；不限第一/通讯作者，不设Top100截断。",
  stats: { sourceScenarioCount: source.records.length, authorScope: "all_authors", institutionScope: "985_211_double_first_class_or_qs_top_200_only", selectedAuthors: ranked.length },
  authors: ranked,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath, ...output.stats }, null, 2));
