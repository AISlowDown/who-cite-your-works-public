import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const date = process.argv[2] || new Date().toISOString().slice(0, 10);
const data = JSON.parse(await fs.readFile(path.join(root, "data", "international-fellows-cache.json"), "utf8"));
const registry = JSON.parse(await fs.readFile(path.join(root, "data", "fellow-source-registry.json"), "utf8"));
const reportDir = path.join(root, "reports", date);
const organizations = registry.sources.map((source) => {
  const status = data.sources?.[source.organizationId] || {};
  const records = data.records.filter((record) => record.organizationId === source.organizationId);
  const years = records.map((record) => record.electionYear).filter(Number.isInteger);
  return { organizationId: source.organizationId, organization: source.organization,
    sourceMode: source.sourceMode, coverage: source.coverage, coverageKind: source.coverageKind,
    publicLimitations: source.publicLimitations, officialUrls: source.sourceUrls,
    recordCount: records.length, yearsCovered: years.length ? `${Math.min(...years)}–${Math.max(...years)}` : "未注明",
    lastAttemptOn: status.lastAttemptOn || null, lastSuccessOn: status.lastSuccessOn || null,
    status: status.status || "not-attempted", limitation: status.error || source.publicLimitations || null,
    affiliationCount: records.filter((record) => record.listedAffiliations?.length).length,
    affiliationRate: records.length ? records.filter((record) => record.listedAffiliations?.length).length / records.length : 0 };
});
const output = { generatedOn: new Date().toISOString(), cacheVerifiedOn: data.verifiedOn,
  totalRecords: data.records.length, counts: data.counts, organizations };
const lines = ["# 国际 Fellow 缓存刷新摘要", "", `- 缓存日期：${data.verifiedOn}`,
  `- 总记录数：${data.records.length}`, "- 说明：未命中只表示当前缓存未找到，不表示该作者不是 Fellow。", "",
  "| 组织 | 记录数 | 覆盖声明 | 年份 | 机构数/覆盖率 | 状态 | 限制说明 |", "| --- | ---: | --- | --- | --- | --- | --- |",
  ...organizations.map((row) => `| ${row.organization} | ${row.recordCount} | ${row.coverageKind}: ${row.coverage} | ${row.yearsCovered} | ${row.affiliationCount}/${(row.affiliationRate * 100).toFixed(1)}% | ${row.status} | ${row.limitation || "—"} |`),
  "", "## 官方入口", "", ...organizations.map((row) => `- ${row.organization}：${row.officialUrls.join(" • ")}`), ""];
await fs.mkdir(reportDir, { recursive: true });
await fs.writeFile(path.join(reportDir, "fellow-cache-refresh-summary.json"), `${JSON.stringify(output, null, 2)}\n`);
await fs.writeFile(path.join(reportDir, "fellow-cache-refresh-summary.md"), lines.join("\n"));
console.log(JSON.stringify({ reportDir, totalRecords: output.totalRecords, organizations: organizations.length }, null, 2));
