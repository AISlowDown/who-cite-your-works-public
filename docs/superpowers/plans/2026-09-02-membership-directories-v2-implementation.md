# Membership Directories V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐两院院士机构履历，并将 IEEE、AAAS、ASCE、AIChE、RSC Fellow 扩展至官方公开来源可证明的最大覆盖范围。

**Architecture:** 使用“来源发现→原始文档获取→组织专用解析器→规范化记录→安全替换来源切片→覆盖质量报告”管线。院士个人页 enrichment 支持断点续跑；Fellow 来源按组织隔离，官网未公开全量时将边界结构化记录。

**Tech Stack:** Node.js ESM、原生 `fetch`、Poppler `pdftotext`、JSON 缓存、Node test runner。

**Spec:** `docs/superpowers/specs/2026-09-02-membership-directories-v2-design.md`

## Global Constraints

- 只接受组织官网、官方 PDF、官方个人页或官方数字凭证。
- 不绕过登录、验证码、robots 或会员隐私设置。
- 未命中不等于不是 Fellow/院士。
- 仅 `verified_same_affiliation` 和 `verified_affiliation_change` 进入 Honor。
- 任何刷新都不得用异常小结果覆盖稳定缓存。

---

### Task 1: 扩展来源覆盖与质量合同

**Files:**
- Modify: `scripts/lib/fellow-cache.mjs`
- Modify: `data/fellow-source-registry.json`
- Test: `tests/fellow-cache.test.mjs`

**Interfaces:**
- Produces: `buildCoverageMetrics(records, source)` 返回 `{recordCount, affiliationCount, affiliationRate, years, coverageClaim}`。
- Produces: `validateCoverageClaim(metrics, source)` 返回错误数组。

- [ ] **Step 1:** 先写失败测试，覆盖机构率、年份范围和“全量”声明的最小行数校验。
- [ ] **Step 2:** 运行 `node --test tests/fellow-cache.test.mjs`，确认因新 API 缺失而失败。
- [ ] **Step 3:** 实现两个函数，将每个来源的 `coverageKind`、`expectedMinimum`、`publicLimitations` 写入 registry。
- [ ] **Step 4:** 重跑测试并提交 `feat: enforce membership coverage contracts`。

### Task 2: 建立官方文档获取与 PDF 文本抽取层

**Files:**
- Create: `scripts/lib/official-document.mjs`
- Test: `tests/official-document.test.mjs`

**Interfaces:**
- Produces: `fetchOfficialDocument({url, allowedDomains, cacheDir})`。
- Produces: `extractPdfText({pdfPath, layout})`。
- Produces: `assertPdfResponse({contentType, bytes})`。

- [ ] **Step 1:** 先写失败测试，覆盖 PDF magic bytes、Cloudflare HTML 伪装 PDF、官方域名白名单和本地文档缓存。
- [ ] **Step 2:** 运行 `node --test tests/official-document.test.mjs`，确认失败原因为 API 缺失。
- [ ] **Step 3:** 实现限时下载、PDF 魔数验证、SHA-256、`pdftotext -layout` 和可复用原始文档元数据。
- [ ] **Step 4:** 重跑测试并提交 `feat: add verified official document ingestion`。

### Task 3: 补齐两院院士机构与履历

**Files:**
- Create: `scripts/lib/academician-profile.mjs`
- Modify: `scripts/refresh-chinese-academicians-cache.mjs`
- Test: `tests/academician-profile.test.mjs`

**Interfaces:**
- Produces: `parseCasProfile(html, url)` 和 `parseCaeProfile(html, url)`。
- Produces: `enrichAcademicianRecord(record, profile, verifiedOn)`。
- Cache fields: `listedAffiliations`, `currentAffiliations`, `careerAffiliations`, `specialty`, `profileEvidence`, `profileFetchStatus`.

- [ ] **Step 1:** 用官方 CAS/CAE 个人页 fixture 写失败测试，覆盖当前机构、历史机构、研究方向和空页。
- [ ] **Step 2:** 运行 `node --test tests/academician-profile.test.mjs`，确认解析器缺失。
- [ ] **Step 3:** 实现解析器与 enrichment，在刷新脚本增加 `--profiles`、`--resume`、`--concurrency <n>`、`--profile-cache <path>`。
- [ ] **Step 4:** 以小样本 fixture 验证断点续跑和失败保留，再运行全量官方个人页 enrichment。
- [ ] **Step 5:** 抽样中科院/工程院各 10 人，运行 lookup 验证机构双确认，提交 `data: enrich Chinese academicians from official profiles`。

### Task 4: 补齐 AAAS 官方可得名单

**Files:**
- Modify: `scripts/lib/fellow-sources/aaas.mjs`
- Create: `tests/fixtures/fellows/aaas-program.txt`
- Test: `tests/fellow-source-adapters.test.mjs`

**Interfaces:**
- Produces: `parseAaasProgramText(text, {year, url, verifiedOn})`.
- `refreshAaas()` 合并当前官方 PDF 和所有可得年度 program PDF，按姓名+年份去重。

- [ ] **Step 1:** 先写失败测试，覆盖多栏 PDF 断行姓名、section 标题和机构/评语分离。
- [ ] **Step 2:** 运行定向测试确认失败，再实现 parser 与 source discovery manifest。
- [ ] **Step 3:** 下载并解析官方可得 PDF，设置安全最小数与年份覆盖矩阵。
- [ ] **Step 4:** 抽样 20 条对照 PDF 文本，提交 `data: expand official AAAS Fellow coverage`。

### Task 5: 补齐 AIChE 历史全量与年度增量

**Files:**
- Modify: `scripts/lib/fellow-sources/aiche.mjs`
- Create: `data/fellow-source-manifests/aiche.json`
- Test: `tests/fellow-source-adapters.test.mjs`

**Interfaces:**
- Produces: `parseAicheHistoricalText(text, verifiedOn)` 保留 PDF 页/行定位。
- Produces: `parseAicheRecognitionPage(html, {year, url, verifiedOn})`.

- [ ] **Step 1:** 先补写失败测试，复现 PDF 同行粘连姓名和年度公告名称。
- [ ] **Step 2:** 运行定向测试确认失败，再修复历史 parser 并实现 recognition parser。
- [ ] **Step 3:** 通过官方 PDF/页面或已验证官方文档快照建立 2018 基线与 2019–2026 年份矩阵。
- [ ] **Step 4:** 抽样 20 条并提交 `data: complete public AIChE Fellow history`。

### Task 6: 扩展 IEEE 公开 Fellow Directory 与年度名单

**Files:**
- Modify: `scripts/lib/fellow-sources/ieee.mjs`
- Create: `data/fellow-source-manifests/ieee.json`
- Test: `tests/fellow-source-adapters.test.mjs`

**Interfaces:**
- Produces: `parseIeeeDirectoryPayload(payload, context)` 和 `parseIeeeAnnualText(text, context)`.
- Directory 记录保留 `directoryVisibility: public-opt-in` 和 citation/elevated society（若官方提供）。

- [ ] **Step 1:** 先写失败测试，覆盖 JSON/HTML directory payload、年度名单和重复人名。
- [ ] **Step 2:** 运行定向测试确认失败，再实现 parser 与安全分页。
- [ ] **Step 3:** 使用 IEEE 官方公开入口获取全部可见记录；如需登录，停在公开边界并补齐官方年度 classes。
- [ ] **Step 4:** 校验分页总数/年份总数，抽样 20 条，提交 `data: expand official IEEE Fellow coverage`。

### Task 7: 扩展 ASCE 公开 Fellow 名单

**Files:**
- Modify: `scripts/lib/fellow-sources/asce.mjs`
- Create: `data/fellow-source-manifests/asce.json`
- Test: `tests/fellow-source-adapters.test.mjs`

**Interfaces:**
- Produces: `parseAsceOfficialRegisterText(text, context)` 返回总数证据，不伪造人名。
- Produces: `parseAsceElevationArticle(html, context)` 返回官方晋升记录。

- [ ] **Step 1:** 先写失败测试，覆盖 Register 中 `Fellows 3,846` 统计与晋升公告。
- [ ] **Step 2:** 运行定向测试确认失败，再实现统计证据和人名 parser。
- [ ] **Step 3:** 爬取 ASCE 官方公开的年度/个人晋升页，将缓存记录数与 Register 总数分开报告。
- [ ] **Step 4:** 抽样 20 条并提交 `data: expand public ASCE Fellow records`。

### Task 8: 建立 RSC 可公开验证的最大名单

**Files:**
- Modify: `scripts/lib/fellow-sources/rsc.mjs`
- Create: `data/fellow-source-manifests/rsc.json`
- Test: `tests/fellow-source-adapters.test.mjs`

**Interfaces:**
- Produces: `parseRscCredentialPage(html, context)`.
- Produces: `parseRscHonoraryFellows(html, context)`，等级为 `Honorary Fellow (HonFRSC)`。

- [ ] **Step 1:** 先写失败测试，覆盖 FRSC 数字凭证、普通职位中的 Fellow 假阳性和 Honorary Fellow 名单。
- [ ] **Step 2:** 运行定向测试确认失败，再实现两类 parser。
- [ ] **Step 3:** 获取官方当前 Honorary Fellows 全集和可公开验证的 FRSC 凭证集，保留“普通 FRSC 无公开全量目录”边界。
- [ ] **Step 4:** 抽样 20 条并提交 `data: expand official RSC membership evidence`。

### Task 9: 全量刷新、抽样验收与文档

**Files:**
- Modify: `scripts/refresh-international-fellows-cache.mjs`
- Modify: `scripts/build-fellow-cache-refresh-summary.mjs`
- Modify: `references/chinese-academicians-cache.md`
- Modify: `references/international-fellows-cache.md`
- Modify: `SKILL.md`
- Create: `reports/2026-09-02/membership-directories-v2-summary.md`
- Test: `tests/skill-membership-policy.test.mjs`

**Interfaces:**
- Refresh report adds `coverageClaim`, `publicLimitations`, `affiliationRate`, `yearsCovered`, `sourceDocumentHashes`, `sampleAudit`.

- [ ] **Step 1:** 先扩展文档合同测试，要求 skill 明确“官方公开最大覆盖”和院士机构 enrichment。
- [ ] **Step 2:** 运行 `node --test tests/skill-membership-policy.test.mjs`，确认因文档未更新而失败。
- [ ] **Step 3:** 运行两院和五个学会全量刷新，生成稳定缓存、日期快照与中文覆盖报告。
- [ ] **Step 4:** 运行 `node --test tests/*.test.mjs`、两个 cache validate 和每来源 20 条证据抽样。
- [ ] **Step 5:** 确认无冲突标记、无零行覆盖、无非官方来源，提交 `docs: publish membership directories v2 coverage report`。
