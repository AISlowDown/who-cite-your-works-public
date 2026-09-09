import fs from "node:fs/promises";
import path from "node:path";
import { resolveCitingArticleAffiliations } from "./lib/author-affiliation.mjs";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultSnapshot = path.join(repoRoot, "data", "institution-priority-cache-2026-09-01.json");
const defaultRuntime = path.join(repoRoot, "data", "institution-priority-cache.json");
const sourcePath = process.argv[2];
if (!sourcePath) throw new Error("Usage: node scripts/build-institution-priority-cache.mjs <citation-records.json> [snapshot.json] [runtime.json]");
const snapshotPath = process.argv[3] || defaultSnapshot;
const runtimePath = process.argv[4] || defaultRuntime;

const domestic985 = new Set([
  "Beihang University", "Beijing Institute of Technology", "Beijing Normal University", "Central South University",
  "Chongqing University", "Dalian University of Technology", "Harbin Institute of Technology",
  "Huazhong University of Science and Technology", "Jilin University", "Nankai University",
  "Northwestern Polytechnical University", "Peking University", "South China University of Technology",
  "Southeast University", "Sichuan University", "Tianjin University", "Tongji University", "Tsinghua University",
  "Wuhan University", "Xi'an Jiaotong University", "Zhejiang University",
]);
const domestic211 = new Set([
  ...domestic985, "Beijing Jiaotong University", "Beijing University of Technology", "Chang'an University",
  "China University of Geosciences", "Donghua University", "Fuzhou University", "Hebei University of Technology",
  "Hohai University", "Hunan Normal University", "Jiangnan University", "Nanchang University",
  "Nanjing Agricultural University", "North China Electric Power University", "Northeast Forestry University",
  "Sichuan Agricultural University", "Taiyuan University of Technology", "University of Science and Technology Beijing",
  "Xidian University", "Zhengzhou University",
]);
const doubleFirstClass = new Set([
  ...domestic211, "Chengdu University of Technology", "Nanjing Forestry University",
  "Nanjing University of Information Science and Technology", "Ningbo University",
]);
const qs2027 = new Map(Object.entries({
  "University of Cambridge": "6", "University College London": "=8", "National University of Singapore": "10",
  "University of Hong Kong": "11", "Nanyang Technological University": "12", "UNSW Sydney": "19",
  "Johns Hopkins University": "=20", "The University of Melbourne": "=22", "Technical University of Munich": "25",
  "Monash University": "31", "Hong Kong University of Science and Technology": "33",
  "The University of Queensland": "=40", "University of British Columbia": "=45",
  "Delft University of Technology": "48", "University of California, Los Angeles": "49",
  "Hong Kong Polytechnic University": "50", "City University of Hong Kong": "=52", "University of Malaya": "56",
  "New York University Abu Dhabi": "58", "The University of Adelaide": "79",
  "University of Technology Sydney": "=87", "Purdue University West Lafayette": "=100",
  "University of Southampton": "=111", "Indian Institute of Technology Delhi": "118", "RMIT University": "=119",
  "Universiti Sains Malaysia": "=128", "University of Exeter": "136", "University of Liverpool": "139",
  "Western University": "=142", "University of California, Santa Barbara": "173",
  "Chalmers University of Technology": "=174", "University of Otago": "198",
}));
const notes = {
  "New York University Abu Dhabi": "按纽约大学母体排名记录",
  "The University of Adelaide": "QS 2027 使用合并后的 Adelaide University 名称",
};

const source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const names = [...new Set(source.records.flatMap((record) =>
  (record.noteworthyAuthors || []).flatMap((author) => resolveCitingArticleAffiliations(author).affiliations),
))].sort();

const institutions = Object.fromEntries(names.map((name) => {
  const classifications = [];
  if (domestic985.has(name)) classifications.push("985", "211", "双一流");
  else if (domestic211.has(name)) classifications.push("211", "双一流");
  else if (doubleFirstClass.has(name)) classifications.push("双一流");
  const qsRank = qs2027.get(name) || null;
  const priorityTag = classifications.length
    ? classifications.join(" · ")
    : qsRank
      ? `QS 2027 世界前200（排名 ${qsRank.startsWith("=") ? `并列 ${qsRank.slice(1)}` : qsRank}）`
      : "";
  return [name, {
    classifications,
    qsEdition: qsRank ? 2027 : null,
    qsRank,
    priorityTag,
    priority: Boolean(priorityTag),
    verificationStatus: "verified-for-current-observed-snapshot",
    note: notes[name] || "",
  }];
}));

const output = {
  schemaVersion: 1,
  verifiedOn: "2026-09-01",
  coverage: "论文引用影响力报告中已观察到的论文署名机构；缓存命中时无需重新联网核验",
  refreshPolicy: "仅对缓存未收录的新机构做定向核验；只有用户要求或榜单版本更新时整体刷新",
  classificationRules: {
    mainlandChina: "历史 985/211 与第二轮双一流",
    outsideMainlandChina: "QS World University Rankings 2027 top 200",
  },
  sources: {
    doubleFirstClass: "https://www.moe.gov.cn/srcsite/A22/s7065/202202/t20220211_598710.html",
    historical985211: "https://www.moe.gov.cn/srcsite/A22/s7065/index_1.html",
    qs2027: "https://www.topuniversities.com/qs-top-uni-wur",
  },
  stats: {
    observedInstitutions: names.length,
    priorityInstitutions: Object.values(institutions).filter((item) => item.priority).length,
  },
  institutions,
};

for (const target of [snapshotPath, runtimePath]) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(output, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify({ snapshotPath, runtimePath, ...output.stats }, null, 2));
