import fs from "node:fs/promises";
import { compactHonor, compactTitle } from "./lib/author-profile-display.mjs";
import { isStrictPriorityInstitution } from "./lib/institution-scope.mjs";

const [cachePath, institutionCachePath, reportPath] = process.argv.slice(2);
if (!cachePath || !institutionCachePath || !reportPath) {
  throw new Error("Usage: node scripts/build-core-author-report.mjs <author-profile-cache.json> <institution-cache.json> <output.md>");
}
const cache = JSON.parse(await fs.readFile(cachePath, "utf8"));
const institutionCache = JSON.parse(await fs.readFile(institutionCachePath, "utf8"));
const esc = (value) => String(value ?? "—").replaceAll("|", "\\|").replaceAll("\n", "；");
const fmt = (value) => Number(value || 0).toLocaleString("zh-CN");

const verified = cache.authors.filter((a) => a.profileVerification.verificationStatus === "已核验职称");
const conflicts = cache.authors.filter((a) => a.profileVerification.verificationStatus === "身份冲突");
const insufficient = cache.authors.filter((a) => a.profileVerification.verificationStatus === "证据不足");
const confirmedProfessors = verified.filter((a) => a.profileVerification.professorStatus === "是");
const substantive = (value) => value && !["官网简历未列示", "待核验", "—"].includes(value);
const nationalLeading = verified.filter((a) => substantive(a.profileVerification.otherNationalLeadingTalent));
const nationalYoung = verified.filter((a) => substantive(a.profileVerification.youthScienceFundClassA) || substantive(a.profileVerification.youthScienceFundClassB) || substantive(a.profileVerification.overseasExcellentYoungScientists) || substantive(a.profileVerification.changjiangScholar) || substantive(a.profileVerification.otherNationalYoungTalent));
const rows = cache.authors.map((a) => {
  const p = a.profileVerification;
  const institutions = [...new Set(a.paperAffiliations || [])]
    .filter((name) => isStrictPriorityInstitution(institutionCache.institutions?.[name]))
    .join(" • ") || "待核验";
  const sources = (p.sourceUrls || []).map((url) => `[来源](${url})`).join(" • ") || "—";
  return `| ${a.rank} | ${esc(a.name)} | ${esc(institutions)} | ${esc(compactTitle(p))} | ${esc(compactHonor(p))} | ${esc(p.verificationStatus)} | ${sources} |`;
});

const content = `# Citation Impact：第一/通讯作者 Top 100

生成日期：2026-09-01

## 当前结论

- 原始高影响引用场景：${cache.stats.sourceScenarioCount}。
- 作者范围：只保留引用论文中的第一作者或通讯作者。
- 机构范围：国内保留 985/211/第二轮“双一流”；港澳台及国外保留 QS 前 200。
- 同时满足作者与机构口径：${cache.stats.coreScenarioCount} 个引用场景。
- 去重后符合口径的作者：${cache.stats.uniqueCoreAuthorsBeforeLimit} 人；按 OpenAlex 总被引次数取前 100 人。
- 已用官方机构主页核验当前职称：${cache.stats.verifiedTitleCount} 人，其中可确认教授/讲席教授：${confirmedProfessors.length} 人。
- 身份冲突：${cache.stats.identityConflictCount} 人；证据不足：${cache.stats.evidenceInsufficientCount} 人；待核验：${cache.stats.pendingCount} 人。
- 已确认其他国家级领军人才：${nationalLeading.length} 人；已确认国家级青年人才：${nationalYoung.length} 人。
- 当前已核验官网中，未发现可直接确认的青年科学基金A类（原国家杰青）、B类（原优青）、海外优青或中国科学院/中国工程院院士；该结论只表示官网简历未列示，不是对全部历年官方名单的排除性证明。

## 已确认的代表性高影响引用者

${verified.slice(0, 20).map((a) => `- ${a.name}：${a.profileVerification.formalTitle}；${a.profileVerification.currentPosition}；OpenAlex 总被引 ${fmt(a.citedByCount)}；${substantive(a.profileVerification.otherNationalLeadingTalent) ? `国家级领军人才：${a.profileVerification.otherNationalLeadingTalent}；` : ""}${substantive(a.profileVerification.otherHonors) ? `其他荣誉：${a.profileVerification.otherHonors}；` : ""}`).join("\n")}

## 身份冲突提醒

${conflicts.map((a) => `- ${a.name}（排名 ${a.rank}）：${a.profileVerification.notes}`).join("\n")}

## 证据不足（已完成检索、未推断职称）

${insufficient.map((a) => `- ${a.name}（排名 ${a.rank}）：${a.profileVerification.notes}`).join("\n")}

## Top 100 作者身份表

| 排名 | 作者 | 机构（学校/单位） | Title（职称/岗位） | Honor / 人才与荣誉 | 核验状态 | 证据 |
|---:|---|---|---|---|---|---|
${rows.join("\n")}

## 口径说明

Top100 排名按重点机构过滤后的作者集合及本次 OpenAlex 总被引次数计算，明细保存在 JSON 缓存与核心作者表；本表只保留便于阅读的作者、机构、职称、合并荣誉、核验状态和证据。职称和人才称号优先使用当前任职机构正式主页；已完成检索但缺少官方当前职称页时标为“证据不足”，同名合并或方向/机构矛盾时标为“身份冲突”。普通共同作者及不满足国内 985/211/第二轮“双一流”或港澳台、国外 QS 前200 条件的机构不进入本表。
`;

await fs.writeFile(reportPath, content);
console.log(reportPath);
