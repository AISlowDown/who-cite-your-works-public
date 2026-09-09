# 两院院士缓存

本缓存是 who-cite-your-works 的核心荣誉身份源。中国作者或中国机构作者的 Honor 核验先查中国科学院、中国工程院；国外工程院与国际 Fellow 仅作后续补充。

## 文件与范围

- 稳定入口：`data/chinese-academicians-cache.json`
- 版本快照：`data/chinese-academicians-cache-YYYY-MM-DD.json`
- 刷新脚本：`scripts/refresh-chinese-academicians-cache.mjs`
- 当选单位补全：`node scripts/enrich-chinese-academician-affiliations.mjs`
- 官方图片文字识别：`swift scripts/ocr-official-list-image.swift <图片> --tsv`
- 院士馆公开档案补全：`node scripts/enrich-chinese-academicians-from-hall-archive.mjs`
- 当选单位来源登记：`data/chinese-academician-affiliation-sources.json`
- 查询脚本：`node scripts/lookup-academician.mjs <姓名> --affiliation <引用论文机构>`

缓存来自中国科学院和中国工程院官网，包含当前在列的中国院士和外籍院士，不含已故名单。记录保留院别、成员类型、学部、资深院士标记、官方个人页与官方名单页；工程院外籍院士同时保留官网名单中的国籍、当选年和专业。

2026-09-02 个人页 enrichment 共处理 2,174 条，成功读取 2,172 条、失败 2 条；官方个人页明确列出当前工作单位的仅 93 条，机构覆盖率 4.28%。这是官方页面字段缺失，不能将其余记录标为当前机构已补齐。

2026-09-05 已从两院官网历次当选名单、2021 年中科院初步候选人表、2023 年中科院官方图片名单、2025 年中科院有效候选人公示表、院士所在机构官网和中国工程院院士馆官方页面公开快照补全机构。当选年份覆盖中科院 1,042/1,054、工程院 1,115/1,120；具有可用机构证据的记录达到 1,506/2,174（69.27%），其中中科院 694/1,054、工程院 812/1,120。

院士馆档案共恢复 186 份官方 PDF，145 份与当前名单唯一匹配；该批次只把主要经历写入 `careerAffiliations`。快照中无结束年月的任职另存 `currentAtSourceAffiliations`，不写入 `currentAffiliations`。2021 年中科院初步候选人表与最终当选名单交叉后覆盖当前缓存中的 63/63 人；2023 年官方图片名单经文字识别并按姓名、当选年份校对后覆盖 59/59 人；2025 年有效候选人公示表与最终当选名单交叉后覆盖 66/73 人，另以机构官方页补齐剩余 7 人。候选表证据类型为 `work-unit-before-election`，不得表述为当前机构；机构官方页明确在职时才写入 `currentAffiliations`。

2021 年中科院最终名单页所引用的图片文件目前返回 404，因此补全使用同年中科院官网初步候选人 HTML 表格，并只保留与最终当选名单交叉命中的姓名。该来源表示增选前同期工作单位，不是当前机构。

## 使用规则

1. 核验作者 Honor 前先按姓名查询稳定缓存；同名结果必须全部保留为候选。
2. 姓名命中只产生候选。机构一致返回 `verified_same_affiliation`；正常跳槽必须由官方履历信号与另一身份信号共同确认，返回 `verified_affiliation_change`。仅这两种状态才写入院士称号。
3. 同一人同时属于两院、多个学部或兼有资深院士身份时，全部用 ` • ` 保留。
4. 缓存命中但身份无法消歧时，写“同名院士候选，身份待核验”，不能直接授予院士标签。
5. 默认复用缓存；名单缺失、官网个人页冲突、缓存超过一个月或用户明确要求刷新时，运行刷新脚本并保留新的日期快照。
6. `candidate_name_only`、`conflict`、`not_found_in_covered_cache` 只进入证据 JSON；机构变更但证据不足时不得授予院士标签。
7. 当选名单工作单位与引用论文署名机构一致时，可作为官方机构信号；若论文发表时间明显晚于当选年份，仍需当前主页、ORCID、论文邮箱或连续履历等另一信号确认是否为同一人。

## 数据结构

`records` 中每条记录至少包含：

- `id`
- `name` / `nameEn` / `aliases`
- `academy`
- `memberType`
- `divisions`
- `senior`
- `country`
- `electionYear`
- `specialty`
- `officialProfileUrl`
- `officialListUrl`
- `listedAffiliations` / `currentAffiliations` / `currentAtSourceAffiliations` / `careerAffiliations`
- `profileEvidence`
- `profileFetchStatus`
- `affiliationEvidence`（可含 `work-unit-at-election`、`work-unit-before-election`、`career-history`和 `ongoing-at-archived-source`）
- `affiliationEnrichment`

`byName` 是规范化姓名到记录 ID 数组的索引。同名不同人不会合并。
