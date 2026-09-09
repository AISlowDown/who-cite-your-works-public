import fs from "node:fs/promises";
import path from "node:path";
import { FileBlob, SpreadsheetFile, Workbook } from "@oai/artifact-tool";
import { compactHonor, compactTitle } from "./lib/author-profile-display.mjs";
import { resolveCitingArticleAffiliations } from "./lib/author-affiliation.mjs";
import { hasStrictPriorityAffiliation, isStrictPriorityInstitution } from "./lib/institution-scope.mjs";

const [sourcePath, rankingPath, institutionCachePath, outputPath, researcherName, authorshipPath, conflictOptionsPath] = process.argv.slice(2);
if (!sourcePath || !rankingPath || !institutionCachePath || !outputPath || !researcherName) {
  throw new Error("Usage: node scripts/build-citation-impact-workbook.mjs <citation-records.json> <author-profile-cache.json> <institution-cache.json> <output.xlsx> <researcher-name> [authorship-map.json]");
}
const [source, ranking, institutionCache, authorshipByDoi, conflictOptions] = await Promise.all([
  fs.readFile(sourcePath, "utf8").then(JSON.parse),
  fs.readFile(rankingPath, "utf8").then(JSON.parse),
  fs.readFile(institutionCachePath, "utf8").then(JSON.parse),
  authorshipPath ? fs.readFile(authorshipPath, "utf8").then(JSON.parse) : Promise.resolve({}),
  conflictOptionsPath ? fs.readFile(conflictOptionsPath, "utf8").then(JSON.parse) : Promise.resolve({}),
]);
const outputDir = path.dirname(outputPath);

const coreAuthor = (author) => (author.citedByCount || 0) > 2000
  && (author.position === 1 || author.corresponding === true)
  && hasStrictPriorityAffiliation(author, institutionCache);
const coreRecords = source.records.filter((record) => (record.noteworthyAuthors || []).some(coreAuthor));
const coreAuthorsFor = (record) => (record.noteworthyAuthors || []).filter(coreAuthor)
  .sort((a, b) => (b.citedByCount || 0) - (a.citedByCount || 0));
const bullet = (items) => [...new Set(items.filter(Boolean))].map((item) => `• ${item}`).join("\n") || "—";
const normalizeDoi = (doi = "") => doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").toLowerCase();

const institutionZh = new Map(Object.entries({
  "Aalborg University":"奥尔堡大学","Beihang University":"北京航空航天大学","Beijing Institute of Technology":"北京理工大学","Beijing University of Civil Engineering and Architecture":"北京建筑大学","Beijing University of Technology":"北京工业大学","Central South University":"中南大学","Chalmers University of Technology":"查尔姆斯理工大学","Chang'an University":"长安大学","Changzhou City Planning and Design Institute":"常州市规划设计院","Changzhou University":"常州大学","Chengdu Normal University":"成都师范学院","China General Nuclear Power Corporation (China)":"中国广核集团","China State Construction Engineering (China)":"中国建筑集团","Chongqing Jiaotong University":"重庆交通大学","Chongqing University":"重庆大学","City University of Hong Kong":"香港城市大学","Clemson University":"克莱姆森大学","Dalian University":"大连大学","Dalian University of Technology":"大连理工大学","Dalarna University":"达拉纳大学","Duy Tan University":"维新大学","Fujian Agriculture and Forestry University":"福建农林大学","Fuzhou University":"福州大学","Guangdong Ocean University":"广东海洋大学","Guangzhou University":"广州大学","Hamad bin Khalifa University":"哈马德·本·哈利法大学","Hangzhou City University":"浙大城市学院","Harbin Institute of Technology":"哈尔滨工业大学","Hebei University of Technology":"河北工业大学","Heriot-Watt University":"赫瑞-瓦特大学","Hong Kong Baptist University":"香港浸会大学","Hong Kong Polytechnic University":"香港理工大学","Huazhong University of Science and Technology":"华中科技大学","Hubei University of Technology":"湖北工业大学","Hunan Normal University":"湖南师范大学","Islamic Azad University, Ahvaz Branch":"伊斯兰阿扎德大学阿瓦士分校","Jiangnan University":"江南大学","Jiangsu University of Science and Technology":"江苏科技大学","Jiangxi University of Finance and Economics":"江西财经大学","Jilin University":"吉林大学","Jiujiang Vocational University":"九江职业大学","Johns Hopkins University":"约翰斯·霍普金斯大学","Key Laboratory of Guangdong Province":"广东省重点实验室","Ministry of Industry and Information Technology":"工业和信息化部","Nanchang University":"南昌大学","Nanjing Agricultural University":"南京农业大学","Nanjing Tech University":"南京工业大学","Nanjing University of Information Science and Technology":"南京信息工程大学","Nankai University":"南开大学","Nanyang Technological University":"南洋理工大学","National University of Singapore":"新加坡国立大学","Netaji Subhas University of Technology":"内塔吉·苏巴斯理工大学","New York University Abu Dhabi":"纽约大学阿布扎比分校","Northeast Forestry University":"东北林业大学","Purdue University West Lafayette":"普渡大学西拉法叶校区","Qingdao University of Science and Technology":"青岛科技大学","Qingdao University of Technology":"青岛理工大学","Sejong University":"世宗大学","Shanghai Dianji University":"上海电机学院","Shanghai Institute of Pollution Control and Ecological Security":"上海污染控制与生态安全研究院","Shahid Beheshti University":"沙希德·贝赫什提大学","Shenzhen University":"深圳大学","Sichuan Agricultural University":"四川农业大学","SINTEF":"挪威工业与技术研究基金会","SINTEF Community":"SINTEF 社区研究院","Southeast University":"东南大学","Swinburne University of Technology":"斯威本科技大学","The University of Queensland":"昆士兰大学","Tianjin University":"天津大学","Tongji University":"同济大学","Tsinghua University":"清华大学","United Nations University":"联合国大学","University of British Columbia":"英属哥伦比亚大学","University of Hong Kong":"香港大学","University of Liverpool":"利物浦大学","University of Münster":"明斯特大学","University of Ulsan":"蔚山大学","Victoria University":"维多利亚大学","Water Research Institute":"水研究院","Wuhan Science and Technology Bureau":"武汉市科学技术局","Wuhan University":"武汉大学","Xi'an Jiaotong University":"西安交通大学","Xi'an University of Architecture and Technology":"西安建筑科技大学","Xi’an Jiaotong-Liverpool University":"西交利物浦大学","Xidian University":"西安电子科技大学","Xiamen University of Technology":"厦门理工学院","Xinyang Normal University":"信阳师范大学","Yangtze University":"长江大学","Yanshan University":"燕山大学","Zhejiang University":"浙江大学","Zhejiang University of Technology":"浙江工业大学","Zhengzhou University":"郑州大学","Zhongkai University of Agriculture and Engineering":"仲恺农业工程学院"
}));
const institutionLabel = (name) => `${institutionZh.get(name) || "中文名待核验"}（${name}）`;
const priorityTag = (name) => institutionCache.institutions?.[name]?.priorityTag || "";
const strictAffiliations = (author) => resolveCitingArticleAffiliations(author).affiliations.filter((name) =>
  isStrictPriorityInstitution(institutionCache.institutions?.[name]));

const scenarioRows = coreRecords.map((record, index) => {
  const authorship = authorshipByDoi[normalizeDoi(record.userWork.doi)] || { first: "待核验", corresponding: [] };
  const mineFirst = authorship.first === researcherName;
  const mineCorresponding = authorship.corresponding.includes(researcherName);
  const authors = coreAuthorsFor(record);
  return [
    index + 1,
    `${record.userWork.title}\n${record.userWork.doi ? `https://doi.org/${normalizeDoi(record.userWork.doi)}` : record.userWork.openalex}`,
    mineFirst ? "是" : `否（第一作者：${authorship.first}）`,
    "否（未发现共同第一声明）",
    mineCorresponding && authorship.corresponding.length === 1 ? "是" : authorship.corresponding.length ? `否（通讯作者：${authorship.corresponding.join("、")}）` : "待核验",
    mineCorresponding && authorship.corresponding.length > 1 ? `是（与 ${authorship.corresponding.filter((n) => n !== researcherName).join("、")}）` : authorship.corresponding.length > 1 ? `否（${authorship.corresponding.join("、")}）` : "否",
    `${record.citingWork.title}\n（${record.citingWork.year || "年份未取得"}）\n${record.citingWork.doi || record.citingWork.openalex}`,
    bullet(authors.map((a) => {
      const roles = [a.position === 1 ? "第一作者" : "", a.corresponding ? "通讯作者" : ""].filter(Boolean).join(" · ");
      const institutions = strictAffiliations(a).map((inst) => `${institutionLabel(inst)} · ${priorityTag(inst)}`).join("；") || "未取得";
      return `${a.name}（${roles}；总被引 ${(a.citedByCount || 0).toLocaleString("en-US")}；h=${a.hIndex || 0}；${a.existingCoauthor ? "既有合著" : "未发现既有合著"}；${institutions}）`;
    })),
  ];
});

const contextRows = coreRecords.map((record, index) => [
  index + 1, record.userWork.title, record.citingWork.title,
  record.citationComment?.contextAvailable ? "有" : "无",
  record.citationComment?.excerpt || "引用关系已确认，但未取得可用引用原句。",
  record.citationComment?.usageCategory || "用途待人工判定",
  record.citationComment?.summaryZh || "引用关系已确认，但引用原因暂不可判定。",
  record.citationComment?.source || "—",
]);

const coreProfileMap = new Map();
for (const record of coreRecords) {
  for (const a of coreAuthorsFor(record)) {
    const key = a.openalexId || a.name;
    const p = coreProfileMap.get(key) || { ...a, firstAuthorScenarios:0, correspondingAuthorScenarios:0, userPapers:new Set(), citingPapers:new Set(), paperAffiliations:new Set() };
    p.citedByCount = Math.max(p.citedByCount || 0, a.citedByCount || 0); p.hIndex = Math.max(p.hIndex || 0, a.hIndex || 0);
    if (a.position === 1) p.firstAuthorScenarios += 1; if (a.corresponding) p.correspondingAuthorScenarios += 1;
    p.existingCoauthor ||= a.existingCoauthor === true; strictAffiliations(a).forEach((x) => p.paperAffiliations.add(x));
    p.userPapers.add(record.userWork.title); p.citingPapers.add(record.citingWork.title); coreProfileMap.set(key,p);
  }
}
const coreProfiles = [...coreProfileMap.values()].sort((a,b) => b.citedByCount-a.citedByCount || a.name.localeCompare(b.name));
const coreProfileRows = coreProfiles.map((a, i) => [
  i + 1, a.name, a.openalexId, a.citedByCount, a.hIndex, a.firstAuthorScenarios, a.correspondingAuthorScenarios,
  a.existingCoauthor ? "是" : "否", bullet([...a.paperAffiliations].map(institutionLabel)),
  bullet([...a.paperAffiliations].map(priorityTag).filter(Boolean)), bullet([...a.userPapers]), bullet([...a.citingPapers]),
]);

const conflictAuthors = ranking.authors.filter((a) => a.profileVerification?.verificationStatus === "身份冲突");
const authorAffiliationSearch = (a) => {
  const affiliations = [...new Set(a.paperAffiliations || [])];
  const queries = affiliations.length
    ? affiliations.map((affiliation) => `"${a.name}" "${affiliation}" professor faculty profile`)
    : [`"${a.name}" professor faculty profile`];
  return {
    queries: bullet(queries),
    links: bullet(queries.flatMap((query) => [
      `https://www.google.com/search?q=${encodeURIComponent(query)}`,
      `https://scholar.google.com/scholar?q=${encodeURIComponent(query)}`,
    ])),
  };
};
const conflictIdentityOptions = new Map(Object.entries(conflictOptions));
const identityOptionsFor = (a) => conflictIdentityOptions.get(a.openalexId) || "已核验单一身份";
const topRows = ranking.authors.map((a) => {
  const p = a.profileVerification;
  const conflict = p.verificationStatus === "身份冲突";
  const search = authorAffiliationSearch(a);
  const relatedPapers = [
    `引用论文：${(a.citingPapers || []).join("；") || "—"}`,
    `引用你的：${(a.userPapers || []).join("；") || "—"}`,
  ].join("\n");
  return [
    a.rank,
    a.name,
    identityOptionsFor(a),
    bullet((a.paperAffiliations || []).map(institutionLabel)),
    conflict ? "候选身份职称见‘全部可能身份’" : compactTitle(p),
    conflict ? "候选身份荣誉待人工确认" : compactHonor(p),
    conflict ? "多候选身份（已全部列出）" : p.verificationStatus,
    a.citedByCount || 0,
    a.hIndex || 0,
    relatedPapers,
    search.queries,
    search.links,
    conflict ? "待人工筛查" : "无需人工筛查",
    "",
    "",
    "",
    "",
    "",
  ];
});

const rankingById = new Map(ranking.authors.map((a) => [a.openalexId, a]));
const rankingByName = new Map(ranking.authors.map((a) => [a.name, a]));
const authorScenarioSeen = new Set();
const authorProfileRows = [];
for (const record of coreRecords) {
  for (const author of coreAuthorsFor(record)) {
    const key = [author.openalexId || author.name, record.citingWork.doi || record.citingWork.title, record.userWork.doi || record.userWork.title].join("||");
    if (authorScenarioSeen.has(key)) continue;
    authorScenarioSeen.add(key);
    const ranked = rankingById.get(author.openalexId) || rankingByName.get(author.name) || author;
    const profile = ranked.profileVerification || {};
    const conflict = profile.verificationStatus === "身份冲突";
    const comment = record.citationComment || {};
    authorProfileRows.push([
      authorProfileRows.length + 1,
      author.name,
      identityOptionsFor(ranked),
      bullet((author.paperAffiliations || []).map(institutionLabel)),
      conflict ? "候选身份职称见‘全部可能身份’" : compactTitle(profile),
      conflict ? "候选身份荣誉待人工确认" : compactHonor(profile),
      record.citingWork.title,
      record.userWork.title,
      comment.excerpt || "引用关系已确认，但未取得可用引用原句。",
      comment.summaryZh || "引用关系已确认，但引用原因暂不可判定。",
    ]);
  }
}
authorProfileRows.sort((a, b) => String(a[1]).localeCompare(String(b[1])) || String(a[6]).localeCompare(String(b[6])) || String(a[7]).localeCompare(String(b[7])));
authorProfileRows.forEach((row, index) => { row[0] = index + 1; });

const wb = Workbook.create();
const overview = wb.worksheets.add("概览");
const scenarios = wb.worksheets.add("引用场景");
const contexts = wb.worksheets.add("引用原文");
const authorProfile = wb.worksheets.add("作者引用明细Profile");
const authors = wb.worksheets.add("核心作者");
const top100 = wb.worksheets.add("Top100作者身份");
const allSheets = [overview, scenarios, contexts, authorProfile, authors, top100];
allSheets.forEach((sheet) => { sheet.showGridLines = false; });

overview.getRange("A1:H1").merge(); overview.getRange("A1").values = [["论文引用影响力雷达（第一/通讯作者＋重点高校口径）"]];
overview.getRange("A3:B13").values = [["指标","值"],["原始引用场景",source.records.length],["新口径引用场景",coreRecords.length],["作者×引用明细行",authorProfileRows.length],["第一/通讯高影响作者（去重）",ranking.stats.uniqueCoreAuthorsBeforeLimit],["Top100 作者",ranking.authors.length],["已核验职称",ranking.stats.verifiedTitleCount],["多候选身份（全部列出）",ranking.stats.identityConflictCount],["证据不足",ranking.stats.evidenceInsufficientCount],["待核验",ranking.stats.pendingCount],["有引用原文",coreRecords.filter((r) => r.citationComment?.contextAvailable).length]];
overview.getRange("D3:H3").merge(); overview.getRange("D3").values = [["口径说明"]];
overview.getRange("D4:H10").merge(); overview.getRange("D4").values = [["作者范围：只纳入总被引次数严格大于 2,000，且在引用论文中担任第一作者或通讯作者的人。机构范围：国内保留 985/211/第二轮‘双一流’；港澳台及国外保留 QS 2027 前 200。Top100 按 OpenAlex 总被引数排序。身份消歧新增‘作者姓名＋引用论文署名机构’组合检索；检索结果仅作为候选证据，仍需结合论文、研究方向和官方主页人工确认。"]];

const writeTable = (sheet, headers, rows) => {
  sheet.getRangeByIndexes(0,0,1,headers.length).values = [headers];
  if (rows.length) sheet.getRangeByIndexes(1,0,rows.length,headers.length).values = rows;
  sheet.freezePanes.freezeRows(1); sheet.freezePanes.freezeColumns(Math.min(2, headers.length));
  sheet.getRangeByIndexes(0,0,1,headers.length).format = { fill: "#123B5D", font: { bold: true, color: "#FFFFFF" }, wrapText: true, horizontalAlignment: "center", verticalAlignment: "center" };
  if (rows.length) sheet.getRangeByIndexes(1,0,rows.length,headers.length).format = { wrapText: true, verticalAlignment: "top" };
  sheet.getRangeByIndexes(0,0,rows.length + 1,headers.length).format.borders = { preset: "outside", style: "thin", color: "#B8CBD0" };
};

writeTable(scenarios,["#","你的被引论文","我是唯一第一作者","我是共同第一作者","我是唯一通讯作者","我是共同通讯作者（与谁）","引用论文","高影响第一/通讯作者、角色与机构"],scenarioRows);
writeTable(contexts,["#","你的被引论文","引用论文","取得原文","引用原句","用途分类","中文总结","证据来源"],contextRows);
writeTable(authorProfile,["#","作者名称","全部可能身份（人工选择）","引用论文署名机构","Title（职称/岗位）","Honor（人才/荣誉）","哪篇论文引用了我","引用了我的哪篇论文","引用原句（原文）","中文总结"],authorProfileRows);
writeTable(authors,["#","作者","OpenAlex","总被引次数","h 指数","第一作者场景","通讯作者场景","既有合著","论文署名机构（中英）","机构优先标签","引用了你的论文","对应引用论文"],coreProfileRows);
writeTable(top100,["排名","作者","全部可能身份（人工选择）","引用论文署名机构","职称/岗位","人才与荣誉","核验状态","总被引", "h 指数","关联论文","作者＋Affiliation 检索词","一键检索链接","人工结论","确认姓名","确认机构","确认职称","确认荣誉/人才称号","人工备注"],topRows);

overview.getRange("A1:H1").format = { fill:"#123B5D", font:{bold:true,color:"#FFFFFF",size:16}, verticalAlignment:"center" };
overview.getRange("A3:B3").format = { fill:"#087E8B", font:{bold:true,color:"#FFFFFF"} };
overview.getRange("D3:H3").format = { fill:"#087E8B", font:{bold:true,color:"#FFFFFF"} };
overview.getRange("A4:B13").format = { fill:"#F7FBFC", borders:{preset:"outside",style:"thin",color:"#B8CBD0"} };
overview.getRange("D4:H10").format = { fill:"#EAF4F6", wrapText:true, verticalAlignment:"top", borders:{preset:"outside",style:"thin",color:"#B8CBD0"} };
overview.getRange("A:A").format.columnWidth=30; overview.getRange("B:B").format.columnWidth=18; overview.getRange("D:H").format.columnWidth=18; overview.getRange("D4:H10").format.rowHeight=32;

scenarios.getRange("A:A").format.columnWidth=7; scenarios.getRange("B:B").format.columnWidth=48; scenarios.getRange("C:F").format.columnWidth=22; scenarios.getRange("G:G").format.columnWidth=54; scenarios.getRange("H:H").format.columnWidth=92; scenarios.getRange(`A2:H${scenarioRows.length+1}`).format.rowHeight=112;
contexts.getRange("A:A").format.columnWidth=7; contexts.getRange("B:C").format.columnWidth=42; contexts.getRange("D:D").format.columnWidth=12; contexts.getRange("E:E").format.columnWidth=70; contexts.getRange("F:F").format.columnWidth=20; contexts.getRange("G:G").format.columnWidth=52; contexts.getRange("H:H").format.columnWidth=28; contexts.getRange(`A2:H${contextRows.length+1}`).format.rowHeight=86;
authorProfile.freezePanes.freezeColumns(4);
authorProfile.getRange("A:A").format.columnWidth=7; authorProfile.getRange("B:B").format.columnWidth=21; authorProfile.getRange("C:C").format.columnWidth=68; authorProfile.getRange("D:D").format.columnWidth=40; authorProfile.getRange("E:E").format.columnWidth=28; authorProfile.getRange("F:F").format.columnWidth=42; authorProfile.getRange("G:H").format.columnWidth=54; authorProfile.getRange("I:I").format.columnWidth=72; authorProfile.getRange("J:J").format.columnWidth=56;
authorProfile.getRange("A1:J1").format.rowHeight=42; authorProfile.getRange(`A2:J${authorProfileRows.length+1}`).format.rowHeight=96;
  for (let row = 0; row < authorProfileRows.length; row += 1) {
  if (authorProfileRows[row][2] !== "已核验单一身份") authorProfile.getRange(`A${row + 2}:J${row + 2}`).format.fill = "#FFF0D6";
  if (!String(authorProfileRows[row][8]).startsWith("引用关系已确认")) authorProfile.getRange(`I${row + 2}:J${row + 2}`).format.fill = "#E8F5E9";
}
authors.getRange("A:A").format.columnWidth=7; authors.getRange("B:B").format.columnWidth=20; authors.getRange("C:C").format.columnWidth=36; authors.getRange("D:H").format.columnWidth=14; authors.getRange("I:J").format.columnWidth=42; authors.getRange("K:L").format.columnWidth=46; authors.getRange(`A2:L${coreProfileRows.length+1}`).format.rowHeight=78;
top100.freezePanes.freezeColumns(3);
top100.getRange("A:A").format.columnWidth=7; top100.getRange("B:B").format.columnWidth=19; top100.getRange("C:C").format.columnWidth=66; top100.getRange("D:D").format.columnWidth=38; top100.getRange("E:E").format.columnWidth=28; top100.getRange("F:F").format.columnWidth=42; top100.getRange("G:G").format.columnWidth=22; top100.getRange("H:I").format.columnWidth=11; top100.getRange("J:J").format.columnWidth=48; top100.getRange("K:K").format.columnWidth=48; top100.getRange("L:L").format.columnWidth=56; top100.getRange("M:M").format.columnWidth=18; top100.getRange("N:P").format.columnWidth=23; top100.getRange("Q:Q").format.columnWidth=34; top100.getRange("R:R").format.columnWidth=30;
top100.getRange("A1:R1").format.rowHeight=40; top100.getRange(`A2:R${topRows.length+1}`).format.rowHeight=78;
top100.getRange(`M2:R${topRows.length+1}`).format.fill="#FFFBEA";
for (const a of conflictAuthors) top100.getRange(`A${a.rank + 1}:R${a.rank + 1}`).format = { fill:"#FFF0D6", wrapText:true, verticalAlignment:"top", rowHeight:142 };

await fs.mkdir(outputDir,{recursive:true});
const file = await SpreadsheetFile.exportXlsx(wb); await file.save(outputPath);
const reopened = await SpreadsheetFile.importXlsx(await FileBlob.load(outputPath));
const checks = {};
for (const name of ["概览","引用场景","引用原文","作者引用明细Profile","核心作者","Top100作者身份"]) {
  const checkRange = name === "Top100作者身份" ? "A1:R8" : name === "作者引用明细Profile" ? "A1:J6" : "A1:H5";
  checks[name] = (await reopened.inspect({kind:"region",sheetId:name,range:checkRange,maxChars:6500})).ndjson;
  const preview = await reopened.render({sheetName:name,autoCrop:"all",scale:name === "概览" ? 1.1 : 0.55,format:"png"});
  await fs.writeFile(`${outputDir}/preview-${name}.png`,new Uint8Array(await preview.arrayBuffer()));
}
const topPreview = await reopened.render({sheetName:"Top100作者身份",range:"A1:R12",scale:0.68,format:"png"});
await fs.writeFile(`${outputDir}/preview-Top100-合并人工校核.png`,new Uint8Array(await topPreview.arrayBuffer()));
const authorProfilePreview = await reopened.render({sheetName:"作者引用明细Profile",range:"A1:J10",scale:0.82,format:"png"});
await fs.writeFile(`${outputDir}/preview-作者引用明细Profile.png`,new Uint8Array(await authorProfilePreview.arrayBuffer()));
const errors = await reopened.inspect({kind:"match",searchTerm:"#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",options:{useRegex:true,maxResults:50},maxChars:3000});
console.log(JSON.stringify({outputPath,coreScenarioCount:coreRecords.length,authorProfileRows:authorProfileRows.length,top100:topRows.length,checks,errors:errors.ndjson},null,2));
