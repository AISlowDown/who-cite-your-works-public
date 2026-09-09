import assert from "node:assert/strict";
import test from "node:test";
import { enrichAcademicianCache, enrichAcademicianRecord, parseAcademicianHallProfile,
  parseAcademicianHallText, parseCaeProfile, parseCasProfile } from "../scripts/lib/academician-profile.mjs";
import { applyElectionAffiliations, parseAcademicianElectionTable,
  parseCasCandidatePublicLocationsText } from "../scripts/lib/academician-affiliations.mjs";

test("parses CAS biography and explicit current and career affiliations", () => {
  const html = `<p class="wztitle">测试院士</p><div class="acadTxt"><p>
    现任浙江大学教授，曾在中国科学院数学与系统科学研究院工作。
    主要从事数学物理反问题研究。</p></div>`;
  const profile = parseCasProfile(html, "https://casad.cas.cn/profile.html");
  assert.equal(profile.name, "测试院士");
  assert.deepEqual(profile.currentAffiliations, ["浙江大学"]);
  assert.ok(profile.careerAffiliations.includes("中国科学院数学与系统科学研究院"));
  assert.match(profile.specialty, /数学物理反问题/);
});

test("parses CAE intro without inventing an affiliation", () => {
  const html = `<div class="right_md_name">曹喜滨</div><div class="intro"><p>
    航天器总体设计专家，主要从事小卫星设计理论、创新技术与工程应用研究。
    1991年毕业于哈尔滨工业大学，获博士学位。2021年当选中国工程院院士。</p></div>`;
  const profile = parseCaeProfile(html, "https://www.cae.cn/profile.html");
  assert.equal(profile.name, "曹喜滨");
  assert.deepEqual(profile.currentAffiliations, []);
  assert.deepEqual(profile.careerAffiliations, []);
  assert.equal(profile.electionYear, 2021);
  assert.match(profile.specialty, /小卫星设计/);
});

test("parses an official Academician Hall career table without treating education as affiliation", () => {
  const html = `<h4>姓名</h4><h5>岑可法</h5><h4>当选院士年份</h4><h5>1995年</h5>
    <h2>主要学历</h2><table><tr><td>1952-09</td><td>1956-07</td><td>华中工学院</td></tr></table>
    <h2>主要经历</h2><table>
      <tr><th>起始年月</th><th>结束年月</th><th>工作单位</th><th>职务职称</th></tr>
      <tr><td>1999-05</td><td>2009-06</td><td>浙江大学机械与能源工程学院</td><td>院长 教授</td></tr>
      <tr><td>2009-06</td><td></td><td>国家水煤浆工程技术研究中心</td><td>所长 教授</td></tr>
    </table>`;
  const profile = parseAcademicianHallProfile(html, "https://ysg.ckcest.cn/official");
  assert.equal(profile.name, "岑可法");
  assert.equal(profile.electionYear, 1995);
  assert.deepEqual(profile.currentAffiliations, ["国家水煤浆工程技术研究中心"]);
  assert.ok(profile.careerAffiliations.includes("浙江大学机械与能源工程学院"));
  assert.ok(!profile.careerAffiliations.includes("华中工学院"));
});

test("parses Academician Hall PDF text and marks open-ended roles only as source-date affiliations", () => {
  const text = `基本信息\n姓名：李椿萱\n1997年 中国工程院\n主要学历\n1959年 - 1963年 台湾成功大学 机械工程系 学士\n主要经历\n1980年 - 1994年 北京航空航天大学飞行器设计及应用力学系 教授\n1994年 北京航空航天大学 教授、博士生导师\n本资料由中国工程院院士馆提供`;
  const profile = parseAcademicianHallText(text, "https://ysg.ckcest.cn/share/104/baseInfo");
  assert.equal(profile.name, "李椿萱");
  assert.equal(profile.electionYear, 1997);
  assert.deepEqual(profile.sourceDateAffiliations, ["北京航空航天大学"]);
  assert.ok(profile.careerAffiliations.includes("北京航空航天大学飞行器设计及应用力学系"));
  assert.ok(!profile.careerAffiliations.includes("台湾成功大学"));
});

test("recognizes an explicitly stated work unit as current affiliation", () => {
  const html = `<p class="wztitle">某院士</p><div class="acadTxt"><p>
    工作单位为挪威奥斯陆大学，从事生态系统研究。</p></div>`;
  assert.deepEqual(parseCasProfile(html, "https://casad.cas.cn/work-unit").currentAffiliations,
    ["挪威奥斯陆大学"]);
});

test("parses legacy CAS election wording that uses academic division member", () => {
  const html = `<p class="wztitle">老院士</p><div class="acadTxt"><p>
    主要从事理论物理研究。1991年当选为中国科学院学部委员（院士）。</p></div>`;
  assert.equal(parseCasProfile(html, "https://casad.cas.cn/legacy").electionYear, 1991);
});

test("enrichment preserves record fields and exposes affiliation evidence", () => {
  const record = { id: "cas:test", name: "测试院士", officialProfileUrl: "https://casad.cas.cn/profile.html" };
  const profile = { name: "测试院士", currentAffiliations: ["浙江大学"],
    careerAffiliations: ["中国科学院数学与系统科学研究院"], specialty: "反问题",
    profileText: "现任浙江大学教授。1995年当选中国科学院院士。", sourceUrl: record.officialProfileUrl };
  const enriched = enrichAcademicianRecord(record, profile, "2026-09-02");
  assert.deepEqual(enriched.listedAffiliations, ["浙江大学"]);
  assert.equal(enriched.electionYear, 1995);
  assert.equal(enriched.profileFetchStatus, "success");
  assert.equal(enriched.profileEvidence.verifiedOn, "2026-09-02");
});

test("cache enrichment resumes successful profiles and retains records on fetch failure", async () => {
  const cache = { records: [
    { id: "cas:ok", name: "成功", academy: "中国科学院", officialProfileUrl: "https://casad.cas.cn/ok" },
    { id: "cae:fail", name: "失败", academy: "中国工程院", officialProfileUrl: "https://www.cae.cn/fail",
      listedAffiliations: ["原机构"] },
  ] };
  let calls = 0;
  const priorProfiles = { "cas:ok": { status: "success", profile: { name: "成功",
    currentAffiliations: ["新机构"], careerAffiliations: [], specialty: "领域", profileText: "证据",
    sourceUrl: "https://casad.cas.cn/ok" } } };
  const result = await enrichAcademicianCache(cache, { priorProfiles, resume: true, verifiedOn: "2026-09-02",
    fetchProfile: async () => { calls += 1; throw new Error("blocked"); } });
  assert.equal(calls, 1);
  assert.deepEqual(result.cache.records[0].listedAffiliations, ["新机构"]);
  assert.deepEqual(result.cache.records[1].listedAffiliations, ["原机构"]);
  assert.equal(result.cache.records[1].profileFetchStatus, "failed-retained");
});

test("parses official election work-unit tables and keeps them historical", () => {
  const html = `<table><tr><td>序号</td><td>姓名</td><td>年龄</td><td>专业</td><td>工作单位</td></tr>
    <tr><td>1</td><td>张 杰</td><td>45岁</td><td>物理</td><td>清华大学</td></tr></table>`;
  const rows = parseAcademicianElectionTable(html, { academy: "中国科学院", electionYear: 2003,
    sourceUrl: "https://casad.cas.cn/official.html" });
  assert.deepEqual(rows[0], { name: "张杰", affiliation: "清华大学", academy: "中国科学院",
    electionYear: 2003, sourceUrl: "https://casad.cas.cn/official.html" });
  const cache = { records: [{ id: "cas:1", name: "张杰", aliases: ["张杰"], academy: "中国科学院",
    listedAffiliations: [], currentAffiliations: [], careerAffiliations: [] }] };
  const merged = applyElectionAffiliations(cache, rows, "2026-09-05");
  assert.deepEqual(merged.records[0].listedAffiliations, ["清华大学"]);
  assert.deepEqual(merged.records[0].careerAffiliations, ["清华大学"]);
  assert.deepEqual(merged.records[0].currentAffiliations, []);
  assert.equal(merged.records[0].affiliationEvidence[0].evidenceType, "work-unit-at-election");
  const noSequence = `<table><tr><th>姓名</th><th>出生年月</th><th>工作单位</th></tr>
    <tr><td>曹喜滨</td><td>1963年02月</td><td>哈尔滨工业大学</td></tr></table>`;
  assert.equal(parseAcademicianElectionTable(noSequence, { academy: "中国工程院", electionYear: 2019,
    sourceUrl: "https://www.cae.cn/official.html" })[0].affiliation, "哈尔滨工业大学");
});

test("extracts elected candidates' work units from the official CAS public-locations PDF text", () => {
  const text = `姓名 工作单位 公示单位\n陈豪 暨南大学 北京大学数学科学学院\n陈豪 暨南大学数学中心 山东大学数学学院\n戴彧虹\n中国科学院数学与系统科学\n研究院\n南方科技大学\n9 月 1 日-9 月 20 日\n唐辉明 中国地质大学（武汉） 长安大学地质工程与测绘学院`;
  assert.deepEqual(parseCasCandidatePublicLocationsText(text, ["陈豪", "戴彧虹", "唐辉明"]), [
    { name: "陈豪", affiliation: "暨南大学" },
    { name: "戴彧虹", affiliation: "中国科学院数学与系统科学研究院" },
    { name: "唐辉明", affiliation: "中国地质大学（武汉）" },
  ]);
});

test("preserves the source-specific affiliation evidence type", () => {
  const cache = { records: [{ id: "cas:2025", name: "陈豪", academy: "中国科学院" }] };
  const evidence = [{ name: "陈豪", affiliation: "暨南大学", academy: "中国科学院",
    electionYear: 2025, evidenceType: "work-unit-before-election", sourceUrl: "https://casad.cas.cn/official.pdf" }];
  const merged = applyElectionAffiliations(cache, evidence, "2026-09-05");
  assert.equal(merged.records[0].affiliationEvidence[0].evidenceType, "work-unit-before-election");
});

test("official current profiles populate current affiliations without changing historical evidence semantics", () => {
  const cache = { records: [{ id: "cas:2025", name: "王海斌", academy: "中国科学院" }] };
  const evidence = [{ name: "王海斌", affiliation: "中国科学院声学研究所", academy: "中国科学院",
    electionYear: 2025, evidenceType: "official-current-profile", sourceUrl: "https://www.ioa.cas.cn/official.html" }];
  const record = applyElectionAffiliations(cache, evidence, "2026-09-05").records[0];
  assert.deepEqual(record.currentAffiliations, ["中国科学院声学研究所"]);
  assert.deepEqual(record.listedAffiliations, ["中国科学院声学研究所"]);
  assert.equal(record.affiliationEvidence[0].evidenceType, "official-current-profile");
});

test("replaces stale affiliations when the same official source is re-parsed", () => {
  const sourceUrl = "https://casad.cas.cn/official.pdf";
  const cache = { records: [{ id: "cas:2025", name: "戴彧虹", academy: "中国科学院",
    listedAffiliations: ["错误公示单位"], careerAffiliations: ["错误公示单位"], currentAffiliations: [],
    affiliationEvidence: [{ affiliation: "错误公示单位", sourceUrl, evidenceType: "work-unit-before-election" }] }] };
  const evidence = [{ name: "戴彧虹", affiliation: "中国科学院数学与系统科学研究院",
    academy: "中国科学院", electionYear: 2025, evidenceType: "work-unit-before-election", sourceUrl }];
  const record = applyElectionAffiliations(cache, evidence, "2026-09-05").records[0];
  assert.deepEqual(record.listedAffiliations, ["中国科学院数学与系统科学研究院"]);
  assert.deepEqual(record.affiliationEvidence.map((item) => item.affiliation), ["中国科学院数学与系统科学研究院"]);
});

test("uses election year to disambiguate academicians with the same name", () => {
  const cache = { records: [
    { id: "cas:old", name: "郭雷", academy: "中国科学院", electionYear: 2001 },
    { id: "cas:new", name: "郭雷", academy: "中国科学院", electionYear: 2023 },
  ] };
  const evidence = [{ name: "郭雷", affiliation: "北京航空航天大学", academy: "中国科学院",
    electionYear: 2023, sourceUrl: "https://casad.cas.cn/2023.html" }];
  const records = applyElectionAffiliations(cache, evidence, "2026-09-05").records;
  assert.deepEqual(records[0].listedAffiliations || [], []);
  assert.deepEqual(records[1].listedAffiliations, ["北京航空航天大学"]);
});
