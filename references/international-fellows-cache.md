# 国际 Fellow 本地缓存

## 文件与命令

- 稳定缓存：`data/international-fellows-cache.json`
- 日期快照：`data/international-fellows-cache-YYYY-MM-DD.json`
- 刷新：`node scripts/refresh-international-fellows-cache.mjs`
- 姓名查询：`node scripts/lookup-fellow.mjs <姓名> --affiliation <引用论文机构>`
- 双机构查询：`node scripts/lookup-fellow.mjs <姓名> --affiliation <历史机构> --current-affiliation <当前机构> --identity-evidence <证据JSON>`

## 官方公开最大覆盖

| 组织 | 第一版覆盖 | 官方入口 |
| --- | --- | --- |
| 美国国家工程院（NAE） | 官方当前公开成员目录，保留 Member、International Member 与 Emeritus 原始等级 | `https://www.nae.edu/20412/MemberDirectory` |
| 英国皇家工程院（RAEng） | 官方当前 Fellows Directory；解析当选年、职称前缀与研究方向，官网检索结果不提供任职机构 | `https://raeng.org.uk/fellows-directory/` |
| 加拿大工程院（CAE Canada） | 官方当前 Directory of Fellows；解析等级、职称与机构 | `https://cae-acg.ca/fellows/directory-of-fellows/` |
| 澳大利亚技术科学与工程院（ATSE） | 官方当前 All Fellows 目录；解析职称与 Fellowship Affiliation | `https://atse.org.au/who-we-are/our-fellows/all-fellows/` |
| Royal Society | 官方当前公开目录 | `https://royalsociety.org/fellows-directory/` |
| IEEE | 官方目录/年度名单，部分覆盖 | `https://www.ieee.org/membership/fellows/fellows-directory.html` |
| AAAS | 官方当前/年度名单，部分覆盖 | `https://www.aaas.org/fellows/listing` |
| IWA | 官方年度公告与个人页，增量覆盖 | `https://www.iwa-network.org/iwa-fellows` |
| ASCE | Register 仅有聚合数；姓名按晋升公告增量覆盖 | `https://www.asce.org/about-asce/official-register` |
| AIChE | 2018 历史名单加官方增量 | `https://www.aiche.org/community/sites/fellows` |
| ACS | 2009 年以来官方年度名单 | `https://www.acs.org/funding/awards/acs-fellows/fellows.html` |
| RSC | 普通 FRSC 个人凭证增量覆盖；Honorary Fellows 官方当前姓名表 | `https://www.rsc.org/standards-and-recognition/honorary-fellows` |

来源登记在 `data/fellow-source-registry.json`，各组织的公开性限制、文档哈希或名单在 `data/fellow-source-manifests/*.json`，受限官网的已核验增量证据在 `data/fellow-official-record-manifest.json`。学校主页和 ORCID 只能用于身份消歧，不能单独创建组织会员记录。

## 使用边界

- 本地命中只产生身份候选；必须再用引用论文机构、研究方向、ORCID 或官方个人主页消歧。
- `Foreign Member`、`Honorary Fellow` 等等级保留原文，不能统一改写为普通 `Fellow`。
- 缓存未覆盖某组织、官网只公开部分人员或姓名未命中时，不能据此写“不是 Fellow”。
- 专业学会的普通 Member、Senior Member、Research Fellow、Postdoctoral Fellow、Visiting Fellow 和编委不写入本缓存。美国国家工程院目录中的 `Member` 是该院正式成员等级，作为来源级例外保留。
- 刷新稳定文件时同时生成日期快照；旧快照保留，不覆盖历史证据。
- 来源出现 403、限流、验证码、零行或异常小结果时保留旧缓存；不得用空结果删除旧记录。

## 2026-09-02 快照

- 总记录：3,522。
- Royal Society：1,921；ACS：1,442（官方 XLSX，2009–2025）；IWA：35（其中 Distinguished Fellow 7、Fellow 28）。
- IEEE、AAAS、AIChE 各保留 1 条官方增量种子，不代表完整目录。
- ASCE 姓名缓存 1 条；2026 Official Register 仅证明聚合总数 3,846 名 Fellow，不公开全量姓名。
- RSC 共 120 条：119 条 Honorary Fellow (HonFRSC) 可见姓名，加 1 条已核验普通 FRSC。RSC 官页声称当前 Honorary Fellows 总数为 120，但年份分组实际可数姓名为 119；该 119/120 差额保留为官方页面内部不一致。
- 每个来源的实时状态、准确 URL、年份和限制见 `reports/2026-09-02/fellow-cache-refresh-summary.md`；可重复运行刷新脚本增量补充。

## 四国工程院第一版

- 名单仅从四个工程院官网公开目录增量写入，保留官网原始成员等级、官方个人页和目录入口。
- 2026-09-05 成功写入：美国国家工程院 2,841 条（Member 2,336、International Member 351、Emeritus 154）；英国皇家工程院 1,725 条（FREng 1,667、HonFREng 58）；加拿大工程院 1,010 条；澳大利亚技术科学与工程院 960 条。
- 合并既有来源后，国际院士/Fellow 稳定缓存共 10,058 条；上述数量是刷新时官网目录的实际可解析记录数，不承诺等同于各机构历史累计总人数。
- 2026-09-05 状态补全后：NAE 有职称 2,812、机构 2,841；RAEng 有职称 1,281、研究方向 1,271，但官网未提供机构；加拿大工程院有职称 829、机构 837；ATSE 有职称 816、机构 747。
- 当前缓存保留 10,058 条原始记录，其中 1,345 条随官网数据带有退休/荣休表述；这些记录全部继续参与身份匹配和报告，不作排除。来源分布为 NAE 828、RAEng 53、加拿大工程院 249、ATSE 78、ACS 137。
- 姓名命中仍须结合引用论文署名机构进行双重确认；目录中的机构为空时，不得仅凭同名授予院士称号。
- 官网实时数量可能因新当选、逝世、荣休或目录展示策略改变；以缓存中的 `verifiedOn`、来源状态与日期快照为准。
- 缓存保留官网公开的全部原始等级。官网自然提供 `Emeritus`、`Retired`、荣休或退休表述时，可记录 `employmentStatus` 与 `retirementEvidence`；该信息为可选元数据，不要求逐人补全，也不影响身份纳入、Honor 或影响力报告。
- 加拿大目录的 `90+` 和中国两院“资深院士”等信息保持原样，不据此推断或排除。
- 修改退休判定规则后，可运行 `node scripts/refresh-international-fellows-cache.mjs --reindex-only` 重建状态、索引和统计，无需重新访问全部官网。

## 双重确认状态

- `verified_same_affiliation`：姓名与引用论文机构、官方名单/官方身份页机构一致。
- `verified_affiliation_change`：引用论文机构与当前机构不同，但有至少一个官方履历信号和另一个身份信号证明正常机构变更。
- `candidate_name_only`：只有姓名命中。
- `conflict`：ORCID、机构或研究方向明显冲突。
- `not_found_in_covered_cache`：当前覆盖范围内未命中，不表示该人不是 Fellow。

仅 `verified_same_affiliation` 和 `verified_affiliation_change` 可以进入展示层 Honor。退休或荣休记录也遵循相同的机构双确认规则，不额外排除。
