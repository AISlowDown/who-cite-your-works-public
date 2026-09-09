import fs from "node:fs/promises";
import path from "node:path";
import { selectCoreAuthors } from "./core-author-ranking.mjs";
import { hasStrictPriorityAffiliation } from "./lib/institution-scope.mjs";

const [sourcePath, outputPath, institutionCachePath] = process.argv.slice(2);
if (!sourcePath || !outputPath || !institutionCachePath) {
  throw new Error("Usage: node scripts/build-core-author-top100.mjs <citation-records.json> <output.json> <institution-cache.json>");
}

const source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const institutionCache = JSON.parse(await fs.readFile(institutionCachePath, "utf8"));
const includeAuthor = (author) => hasStrictPriorityAffiliation(author, institutionCache);
const authors = selectCoreAuthors(source.records, { threshold: 2000, limit: 100, includeAuthor }).map((author) => ({
  ...author,
  profileVerification: {
    currentTitle: "待核验",
    professorStatus: "待核验",
    overseasExcellentYoungScientists: "待核验",
    nationalScienceFundDistinguishedYoungScholars: "待核验",
    academician: "待核验",
    verificationStatus: "待核验",
    verifiedOn: null,
    sourceUrls: [],
    notes: "",
  },
}));

const coreScenarioCount = source.records.filter((record) =>
  (record.noteworthyAuthors || []).some((author) =>
    (author.citedByCount || 0) > 2000 && (author.position === 1 || author.corresponding === true) && includeAuthor(author),
  ),
).length;

const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sourceRetrievedAt: source.metadata.retrievedAt,
  rule: "仅纳入总被引次数严格大于2000、在引用论文中担任第一作者或通讯作者，并署名于国内985/211/第二轮双一流或港澳台及国外QS前200机构的作者；按总被引次数降序取前100。",
  stats: {
    sourceScenarioCount: source.records.length,
    coreScenarioCount,
    authorScope: "first_corresponding",
    institutionScope: "985_211_double_first_class_or_qs_top_200_only",
    uniqueCoreAuthorsBeforeLimit: selectCoreAuthors(source.records, { threshold: 2000, limit: Number.MAX_SAFE_INTEGER, includeAuthor }).length,
    selectedAuthors: authors.length,
  },
  authors,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath, ...output.stats }, null, 2));
