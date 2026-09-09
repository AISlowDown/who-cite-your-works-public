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

## 等级判定与中文译名

先确定组织英文全名，再核对该组织的正式等级和官方当选公告/目录，最后结合引用论文 affiliation 完成身份双确认。中文翻译不替代荣誉资格证据；工程院名称中出现 Academy 或个人简介写 member，均不足以自动判为院士。

| 组织与原始等级 | 中文展示与边界 |
| --- | --- |
| 美国国家工程院 National Academy of Engineering：正式 Member | 美国国家工程院院士；仅限该院官方当选或目录记录，不推广到所有组织的 Member |
| 加拿大工程院 Canadian Academy of Engineering：正式 Fellow（FCAE） | 加拿大工程院院士；泛称 member of the academy 不足以确定正式等级 |
| IEEE Member / Senior Member / Fellow | IEEE 会员 / 高级会员 / 会士；前两者不能升级为 Fellow 或院士 |
| 其他专业学会 Member / Fellow | 普通 Member 为会员；Fellow 保留原称或使用有来源的会士译名，不统一译为院士 |
| Royal Society Fellow（FRS） | 官方中文机构有“会士”和“院士”不同用法；保留 FRS 并标明采用的译名来源，不宣称其中一种是唯一官方译法 |
| committee member / board member | 委员会成员 / 理事（具体职务依组织定义）；不能单凭职务授予院士或 Fellow 荣誉 |
| Research / Postdoctoral / Visiting Fellow | 研究、博士后或访问岗位，不是组织评选的 Fellow 荣誉 |

`Foreign`、`International`、`Honorary`、`Emeritus`、`Distinguished`、`Life` 等修饰词必须保留并按具体组织释义；不统一改成普通 Fellow，不根据姓名、族裔或任职国家推断外籍身份。Royal Society Foreign Member 也不能并入普通 FRS。

### 译名证据记录

在私有证据 JSON 中保留 `organizationOriginal`、`gradeOriginal`、`displayNameZh`、`membershipSourceUrl`、`translationSourceUrl`、`translationSourceType` 和核验日期。`translationSourceType` 区分“组织自身中文来源”与“高校/两院等官方机构中文用法”；后者是官方机构的翻译使用实例，不等于该组织自定的唯一中文名称。尚无可靠中文译名时直接保留英文，不自行造出“院士”称号。

这些是报告证据字段要求，不表示现有缓存已全部补齐。原始缓存等级不得因显示翻译而覆盖或改写；Excel 的 Honor 仅展示已确认的称号，多项用 ` • ` 分隔，译名来源和内部字段留在 JSON。

### 已核对的官方来源入口

- [IEEE 中国：会员等级](https://cn.ieee.org/member_grade/)：组织自身中文来源，区分高级会员与会士。
- [美国国家科学院体系：成员](https://www.nationalacademies.org/members)：核对正式成员制度；[中国工程院官方报道](https://en.cae.cn/cae/html/main/col296/2023-07/24/20230724190725867466548_1.html)提供“美国国家工程院院士”中文用法。
- [加拿大工程院：Fellowship 类别](https://cae-acg.ca/fellows/fellowship-procedure-categories-of-fellowship/)：核对正式 Fellow 类别；[香港工程科学院双语资料](https://ibas.hkae.hk/2023/pdf/HKMA-AES_Booklet_Final_Digital-Full.pdf)提供 Fellow 与“加拿大工程院院士”的对应用法。
- Royal Society 的中文用法分别见[中国科学院“会士”表述](https://www.cas.cn/yw/202601/t20260114_5096154.shtml)、[香港理工大学院士页面](https://www.polyu.edu.hk/academicians/?sc_lang=sc)及[中国科学院“外籍会员”表述](https://casad.cas.cn/ysdt2022/202303/t20230307_4878095.html)。这些是中文机构用法，不冒充 Royal Society 自身唯一官方译名。

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
