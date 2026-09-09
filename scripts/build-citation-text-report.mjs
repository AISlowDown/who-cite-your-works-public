import fs from "node:fs/promises";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, item, index, all) => {
  if (item.startsWith("--")) pairs.push([item.slice(2), all[index + 1]]);
  return pairs;
}, []));

const required = ["researcher", "candidates", "profiles", "comments", "institutions", "output"];
const missing = required.filter((key) => !args[key]);
if (missing.length) {
  throw new Error(`缺少参数：${missing.map((key) => `--${key}`).join("、")}`);
}

const [candidateData, profileData, commentData, institutionBase, institutionSupplement] = await Promise.all([
  fs.readFile(args.candidates, "utf8").then(JSON.parse),
  fs.readFile(args.profiles, "utf8").then(JSON.parse),
  fs.readFile(args.comments, "utf8").then(JSON.parse),
  fs.readFile(args.institutions, "utf8").then(JSON.parse),
  args["institution-supplement"]
    ? fs.readFile(args["institution-supplement"], "utf8").then(JSON.parse)
    : Promise.resolve({ institutions: {} }),
]);

const threshold = Number(args["citation-threshold"] || 2000);
const generatedOn = args.date || candidateData.generatedOn || new Date().toISOString().slice(0, 10);
const institutions = {
  ...(institutionBase.institutions || {}),
  ...(institutionSupplement.institutions || {}),
};

const institutionZh = new Map(Object.entries({
  "Anhui University":"安徽大学","Arizona State University":"亚利桑那州立大学","Beihang University":"北京航空航天大学","Beijing Institute of Technology":"北京理工大学","Beijing Normal University":"北京师范大学","Beijing University of Chemical Technology":"北京化工大学","Beijing University of Technology":"北京工业大学","Brown University":"布朗大学","California Institute of Technology":"加州理工学院","Carnegie Mellon University":"卡内基梅隆大学","Central South University":"中南大学","Changchun Institute of Applied Chemistry":"中国科学院长春应用化学研究所","China Agricultural University":"中国农业大学","China University of Geosciences (Beijing)":"中国地质大学（北京）","China University of Mining and Technology":"中国矿业大学","China University of Petroleum, East China":"中国石油大学（华东）","Chongqing University":"重庆大学","City University of Hong Kong":"香港城市大学","Dalian Institute of Chemical Physics":"中国科学院大连化学物理研究所","Dalian University of Technology":"大连理工大学","Donghua University":"东华大学","East China Normal University":"华东师范大学","East China University of Science and Technology":"华东理工大学","Fudan University":"复旦大学","Fuzhou University":"福州大学","Georgia Institute of Technology":"佐治亚理工学院","Guizhou University":"贵州大学","Hainan University":"海南大学","Hanyang University":"汉阳大学","Harbin Institute of Technology":"哈尔滨工业大学","Harvard University":"哈佛大学","Hebei University of Technology":"河北工业大学","Hong Kong Polytechnic University":"香港理工大学","Huazhong University of Science and Technology":"华中科技大学","Imperial College London":"伦敦帝国理工学院","Indian Institute of Technology Madras":"印度理工学院马德拉斯分校","Institute of Process Engineering Chinese Academy of Sciences":"中国科学院过程工程研究所","Institute of Science Tokyo":"东京科学大学","Jiangnan University":"江南大学","Jilin University":"吉林大学","Khalifa University of Science and Technology":"哈利法科技大学","Khalifa University":"哈利法大学","King Abdullah University of Science and Technology":"阿卜杜拉国王科技大学","Korea Institute of Science and Technology":"韩国科学技术研究院","Korea University":"高丽大学","Lanzhou Institute of Chemical Physics, Chinese Academy of Sciences":"中国科学院兰州化学物理研究所","Massachusetts Institute of Technology":"麻省理工学院","Nanchang University":"南昌大学","Nanjing Forestry University":"南京林业大学","Nanjing Normal University":"南京师范大学","Nanjing University":"南京大学","Nanjing University of Aeronautics and Astronautics":"南京航空航天大学","Nanjing University of Information Science and Technology":"南京信息工程大学","Nanjing University of Science and Technology":"南京理工大学","Nankai University":"南开大学","Nanyang Technological University":"南洋理工大学","National University of Defense Technology":"国防科技大学","National University of Singapore":"新加坡国立大学","North China Electric Power University":"华北电力大学","Northwestern Polytechnical University":"西北工业大学","Peking University":"北京大学","Pennsylvania State University":"宾夕法尼亚州立大学","Princeton University":"普林斯顿大学","Qatar University":"卡塔尔大学","RMIT University":"皇家墨尔本理工大学","RWTH Aachen University":"亚琛工业大学","Rice University":"莱斯大学","Seoul National University":"首尔大学","Shandong University":"山东大学","Shanghai Jiao Tong University":"上海交通大学","Shanghai University":"上海大学","ShanghaiTech University":"上海科技大学","Shenzhen Institutes of Advanced Technology, , Chinese Academy of Sciences":"中国科学院深圳先进技术研究院","Sichuan University":"四川大学","Soochow University":"苏州大学","South China Normal University":"华南师范大学","South China University of Technology":"华南理工大学","Southeast University":"东南大学","Southwest Petroleum University":"西南石油大学","Southwest University":"西南大学","Stanford University":"斯坦福大学","Sungkyunkwan University":"成均馆大学","Texas A&M University":"德克萨斯A&M大学","The Pennsylvania State University - University Park Campus":"宾夕法尼亚州立大学帕克校区","The University of Adelaide":"阿德莱德大学","The University of Queensland":"昆士兰大学","The University of Texas at Austin":"德克萨斯大学奥斯汀分校","The University of Tokyo":"东京大学","The University of Western Australia":"西澳大学","Tiangong University":"天津工业大学","Tianjin Medical University":"天津医科大学","Tianjin University":"天津大学","Tongji University":"同济大学","Trinity College Dublin":"都柏林圣三一大学","Tsinghua University":"清华大学","UNSW Sydney":"新南威尔士大学","University of Alberta":"阿尔伯塔大学","University of British Columbia":"英属哥伦比亚大学","University of California, Los Angeles":"加州大学洛杉矶分校","University of Chicago":"芝加哥大学","University of Chinese Academy of Sciences":"中国科学院大学","University of Hong Kong":"香港大学","University of Illinois Urbana-Champaign":"伊利诺伊大学厄巴纳-香槟分校","University of Jinan":"济南大学","University of Michigan":"密歇根大学","University of Oxford":"牛津大学","University of Queensland":"昆士兰大学","University of Science and Technology Beijing":"北京科技大学","University of Science and Technology of China":"中国科学技术大学","University of Southern California":"南加州大学","University of Sydney":"悉尼大学","University of Texas at Austin":"德克萨斯大学奥斯汀分校","University of Toronto":"多伦多大学","University of Warwick":"华威大学","University of Western Australia":"西澳大学","University of Wisconsin-Madison":"威斯康星大学麦迪逊分校","University of Wisconsin–Madison":"威斯康星大学麦迪逊分校","Washington University in St. Louis":"圣路易斯华盛顿大学","Wuhan University":"武汉大学","Wuhan University of Technology":"武汉理工大学","Xi'an Jiaotong University":"西安交通大学","Xian Jiaotong University":"西安交通大学","Yangzhou University":"扬州大学","Yonsei University":"延世大学","Zhejiang University":"浙江大学","Zhengzhou University":"郑州大学"
}));

const unique = (values) => [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
const translateText = (value) => {
  let translated = String(value || "");
  for (const [english, chinese] of [...institutionZh.entries()].sort((a, b) => b[0].length - a[0].length)) {
    translated = translated.split(english).join(chinese);
  }
  translated = translated
    .replaceAll("Proffessor", "教授")
    .replaceAll("Chair in Materials Design", "材料设计讲席教授")
    .replaceAll("Group Leader of Bio-separation and Bio-interface Molecular Mechanism", "生物分离与生物界面分子机制课题组组长")
    .replaceAll("Heritage Medical Research Institute Investigator", "Heritage 医学研究所研究员");
  return translated;
};
const institutionLabel = (name) => {
  const entry = institutions[name] || {};
  const translated = institutionZh.get(name) || name;
  if ((entry.classifications || []).length) return `${translated}（${entry.classifications.join(" • ")}）`;
  if (entry.qsRank != null) return `${translated}（QS 2027 #${String(entry.qsRank).replace(/^=/, "")}）`;
  return translated;
};
const cell = (value) => String(value ?? "")
  .replaceAll("|", "\\|")
  .replace(/\r?\n/g, "<br>")
  .trim();
const formatNumber = (value) => Number(value || 0).toLocaleString("en-US");

const seen = new Set();
const scenarios = [];
let selfCitationScenariosExcluded = 0;
for (const record of candidateData.strictCandidates || candidateData.candidates || []) {
  const author = record.citingAuthor || {};
  const targetAuthorId = candidateData.scope?.targetAuthorId || "";
  const workAuthorIds = record.citingWork?.authorIds || [];
  const isSelfCitation = record.citingWork?.isSelfCitation === true
    || workAuthorIds.some((id) => id === targetAuthorId || String(id).endsWith(`/${targetAuthorId}`));
  if (isSelfCitation) {
    selfCitationScenariosExcluded += 1;
    continue;
  }
  if (!(Number(author.citedByCount || 0) > threshold)) continue;
  if (!Array.isArray(author.roles) || !author.roles.some((role) => role === "第一作者" || role === "通讯作者")) continue;
  if (!(author.priorityAffiliations || []).length) continue;
  const key = [author.id, record.citingWork?.id, record.targetWork?.id].join("|");
  if (seen.has(key)) continue;
  seen.add(key);

  const profile = profileData.profiles?.[author.id] || {};
  const comment = commentData.comments?.[`${record.targetWork?.id}|${record.citingWork?.id}`] || {};
  scenarios.push({
    authorId: author.id,
    author: author.name,
    institutionList: unique((author.priorityAffiliations || []).map(institutionLabel)),
    institutions: unique((author.priorityAffiliations || []).map(institutionLabel)).join(" • "),
    roles: unique(author.roles).join(" • "),
    citations: Number(author.citedByCount || 0),
    title: translateText(profile.title || "引用论文作者（公开档案未列明具体职称）"),
    honor: translateText(profile.honor || "未发现可核验的公开人才/荣誉信息"),
    citingPaper: record.citingWork?.title || "",
    targetPaper: record.targetWork?.title || "",
    excerpt: comment.excerpt || "未取得可用引用原句",
    location: comment.location || (comment.contextAvailable ? "数据源未提供章节/页码" : "未取得"),
    summary: comment.summaryZh || "引用关系已确认，但引用原文暂未公开或未被数据源收录。",
  });
}

scenarios.sort((a, b) => b.citations - a.citations
  || a.author.localeCompare(b.author, "en")
  || a.citingPaper.localeCompare(b.citingPaper, "en")
  || a.targetPaper.localeCompare(b.targetPaper, "en"));

const authorMap = new Map();
for (const row of scenarios) {
  const current = authorMap.get(row.authorId) || { ...row, scenarioCount: 0, roles: [], institutionList: [] };
  current.scenarioCount += 1;
  current.roles.push(row.roles);
  current.institutionList.push(...row.institutionList);
  authorMap.set(row.authorId, current);
}
const authors = [...authorMap.values()].map((author) => ({
  ...author,
  roles: unique(author.roles.flatMap((value) => value.split(" • "))).join(" • "),
  institutions: unique(author.institutionList).join(" • "),
})).sort((a, b) => b.citations - a.citations || a.author.localeCompare(b.author, "en"));

const originalExcerptCount = scenarios.filter((row) => row.excerpt !== "未取得可用引用原句").length;
const titleCount = authors.filter((row) => !row.title.includes("未列明具体职称")).length;
const honorCount = authors.filter((row) => !row.honor.includes("未发现可核验")).length;
const targetPaperCount = new Set(scenarios.map((row) => row.targetPaper)).size;

const lines = [
  `# ${args.researcher} Citation Impact 文本报告`,
  "",
  `生成日期：${generatedOn}`,
  "",
  "## 检索口径",
  "",
  `- 目标研究者：${args.researcher}`,
  `- 作者范围：${candidateData.scope?.citingAuthorRoles?.join("、") || "第一作者、通讯作者"}`,
  `- 作者总被引门槛：严格大于 ${formatNumber(threshold)}`,
  `- 机构范围：${candidateData.scope?.institutions || "国内 985/211/第二轮双一流；港澳台及境外 QS 前 200"}`,
  `- 作者自引：${candidateData.scope?.selfCitations || "剔除引用论文作者名单中包含目标研究者本人的全部场景"}`,
  `- 数据日期：${generatedOn}`,
  "",
  "## 结果摘要",
  "",
  `- 符合条件的高影响作者：${formatNumber(authors.length)} 位`,
  `- 符合条件的引用场景：${formatNumber(scenarios.length)} 条`,
  `- 已剔除作者自引：${formatNumber(candidateData.stats?.selfCitationPairsExcluded ?? selfCitationScenariosExcluded)} 篇引用论文`,
  `- 涉及目标论文：${formatNumber(targetPaperCount)} 篇`,
  `- 已取得可核验引用原文：${formatNumber(originalExcerptCount)} 条`,
  `- 已核验明确 Title：${formatNumber(titleCount)} 位`,
  `- 已核验 Honor / 人才与荣誉：${formatNumber(honorCount)} 位`,
  "",
  "## 作者概览",
  "",
  "| 排名 | 作者 | 机构 | 作者角色 | 作者总被引 | Title（职称/岗位） | Honor（人才/荣誉） | 引用场景数 |",
  "| ---: | --- | --- | --- | ---: | --- | --- | ---: |",
];

authors.forEach((row, index) => {
  lines.push(`| ${index + 1} | ${cell(row.author)} | ${cell(row.institutions)} | ${cell(row.roles)} | ${formatNumber(row.citations)} | ${cell(row.title)} | ${cell(row.honor)} | ${row.scenarioCount} |`);
});

lines.push(
  "",
  "## 全部引用场景",
  "",
  "| 序号 | 作者 | 机构 | 作者角色 | 作者总被引 | Title（职称/岗位） | Honor（人才/荣誉） | 引用该研究者的论文 | 该研究者被引用的论文 | 引用原句（原文） | 章节/页码 | 中文总结 |",
  "| ---: | --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- |",
);

scenarios.forEach((row, index) => {
  lines.push(`| ${index + 1} | ${cell(row.author)} | ${cell(row.institutions)} | ${cell(row.roles)} | ${formatNumber(row.citations)} | ${cell(row.title)} | ${cell(row.honor)} | ${cell(row.citingPaper)} | ${cell(row.targetPaper)} | ${cell(row.excerpt)} | ${cell(row.location)} | ${cell(row.summary)} |`);
});

lines.push(
  "",
  "## 说明",
  "",
  "作者总被引、职称、人才与荣誉、机构属性及 QS 排名会随时间变化；本报告仅对应上述生成日期。未取得引用原文的场景只确认引用关系，不推测引用用途。",
  "",
);

await fs.mkdir(path.dirname(args.output), { recursive: true });
await fs.writeFile(args.output, lines.join("\n"), "utf8");
console.log(JSON.stringify({
  output: args.output,
  authorCount: authors.length,
  scenarioCount: scenarios.length,
  targetPaperCount,
  originalExcerptCount,
  titleCount,
  honorCount,
}, null, 2));
