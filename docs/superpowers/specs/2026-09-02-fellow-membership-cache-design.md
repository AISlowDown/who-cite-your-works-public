# 国际院士与 Fellow 名单第一版设计

日期：2026-09-02

## 目标

在现有两院院士和 Royal Society 本地缓存基础上，接入 IEEE、AAAS、IWA、ASCE、AIChE、ACS、RSC 的官方 Fellow 信息，并把“姓名命中”升级为“姓名与 affiliation 双确认”。系统需要提高 Honor 命中率，同时避免同名作者、普通会员、研究岗位或机构变更导致的误认。

第一版不承诺覆盖每个组织的全部历史成员。每个组织必须声明官方来源类型和覆盖范围；未命中只能表示当前缓存未找到，不能表示该作者不是 Fellow。

## 方案选择

采用混合缓存方案：

- 官方提供完整、可复现目录时，建立全量当前名单缓存。
- 官方只提供年度入选名单时，按年份累积官方记录。
- 官方不公开完整目录或存在访问限制时，只围绕待核验作者保存官方增量记录。
- 学校主页和 ORCID 可以用于身份消歧和增量验证，但不能伪装成组织完整名单。

不采用两种替代方案：其一是强行抓取所有组织的“完整名单”，因为部分组织没有公开完整目录；其二是只查询当前 Top100 作者，因为这会失去本地缓存的复用价值。

## 第一版组织范围

| 组织 | 目标等级 | 第一版来源模式 | 缓存覆盖声明 |
| --- | --- | --- | --- |
| Royal Society | Fellow、Foreign Member、Honorary Fellow、Royal Fellow、Statute 12 | 官方当前目录 | `official-current-directory` |
| IEEE | IEEE Fellow | 官方 Fellow Directory 与官方年度名单 | `official-public-directory-or-annual`；公开目录可能不是全量 |
| AAAS | AAAS Fellow | 官方当前数据库或官方年度名单/文件 | `official-current-or-annual` |
| IWA | IWA Fellow、Distinguished Fellow 等官网明确等级 | 官方 Fellow 页面、年度公告或个人页 | `official-incremental`，除非发现完整目录 |
| ASCE | ASCE Fellow、Distinguished Member | 官方目录、年度公告或个人页 | `official-incremental-or-annual` |
| AIChE | AIChE Fellow | 官方 Fellow 名单、目录或年度公告 | `official-incremental-or-annual` |
| ACS | ACS Fellow | ACS Fellows Program 官方年度名单 | `official-annual` |
| RSC | Fellow of the Royal Society of Chemistry | RSC 官方个人页、名单或公告 | `official-incremental`，普通会员不纳入 |

来源适配器只能读取组织官网或组织发布的正式文件。搜索引擎结果、学校新闻、出版商作者简介和 ORCID 只作为寻找或消歧证据，不直接写入官方名单缓存。

## 数据模型

国际 Fellow 稳定缓存继续使用 `data/international-fellows-cache.json`，并生成日期快照。每条记录至少包含：

```json
{
  "id": "organization:official-record-id",
  "name": "Full Name",
  "aliases": ["Full Name", "F. Name"],
  "organizationId": "ieee",
  "organization": "IEEE",
  "membershipGrade": "Fellow",
  "membershipGradeZh": "IEEE Fellow",
  "electionYear": 2025,
  "listedAffiliations": ["Official affiliation if published"],
  "status": "current-or-elected",
  "sourceMode": "official-directory|official-annual|official-incremental",
  "coverage": "organization-level coverage label",
  "officialProfileUrl": "official person page or null",
  "officialListUrl": "official list page",
  "verifiedOn": "2026-09-02"
}
```

同一作者拥有多个组织荣誉时保存多条记录，不跨组织合并。相同组织出现多个官方等级时保留原始等级和年份，不静默覆盖。

## 来源登记和增量更新

新增组织来源登记文件，保存组织 ID、官方域名、来源模式、名单 URL、等级范围、公开完整度、解析器名称和最后成功刷新时间。每个来源适配器独立运行并输出统一记录结构。

刷新流程：

1. 读取现有稳定缓存和组织来源登记。
2. 逐组织获取官方目录或年度名单。
3. 解析为统一记录并校验非零结果、等级和官方域名。
4. 用组织 ID、官方记录 ID、姓名、等级和年份去重。
5. 将新记录与稳定缓存合并，同时生成日期快照。
6. 某组织获取失败时保留旧记录，记录刷新失败，不把该组织成员删除。

年度名单不得覆盖往年记录。官方当前目录中暂时消失的记录标记为“本次未观察到”，只有取得正式撤销或更正证据时才能删除。

## 姓名与 affiliation 双确认

名单查询分为“候选召回”和“身份确认”两步。姓名命中永远只产生候选。

输入信息包括：作者姓名及变体、引用论文 affiliation、当前官网 affiliation、ORCID、研究方向关键词和可用官方个人主页。

### 确认状态

- `verified_same_affiliation`：姓名匹配，且官方 Fellow 记录、组织个人页或学校官方页中的机构与引用论文 affiliation 匹配。
- `verified_affiliation_change`：姓名匹配，引用论文机构与当前机构不同，但官方履历、ORCID、研究方向或连续论文经历能够证明机构变更；至少需要两个身份信号，其中必须包含一个官方来源。
- `candidate_name_only`：只有姓名匹配，机构或其他身份信号不足。
- `conflict`：姓名匹配但机构、研究方向或个人标识明显冲突。
- `not_found_in_covered_cache`：当前缓存未找到；只描述缓存结果，不是否定身份。

### affiliation 规则

- 论文发表时机构优先取出版商 HTML/PDF 的作者—机构对应关系，聚合平台仅作回退。
- 机构名称先经过规范化、别名和更名映射，再比较；不能靠一个通用词如 `University` 或 `Institute` 判定匹配。
- 当前机构不同不自动判错。用户已允许在能够证明正常跳槽时确认身份，并同时保存论文历史机构和当前机构。
- 官方名单不提供 affiliation 时，必须再取得组织个人页、学校官方主页或其他官方身份材料；姓名单独命中不能写入报告 Honor。

## 查询与报告接入

`lookup-fellow.mjs` 扩展为支持姓名和可选 affiliation/ORCID 输入，并返回候选记录、组织覆盖信息和确认状态。院士查询使用同一身份确认模块，不能再以姓名命中直接输出院士身份。

作者 Profile 补全过程为：

1. 从引用论文提取作者姓名与历史 affiliation。
2. 查询两院院士缓存和国际 Fellow 缓存。
3. 用统一身份确认模块完成 affiliation 双确认。
4. 仅将 `verified_same_affiliation` 和 `verified_affiliation_change` 写入报告 Honor。
5. `candidate_name_only` 和 `conflict` 留在证据 JSON，不写入展示层确定结论。
6. 多项已确认荣誉在一个 Honor 单元格中用 ` • ` 分隔。

## 失败处理

- 官方站点限流、403、验证码或 robots 限制时停止该来源本次刷新，保留旧缓存并记录错误。
- PDF 或 HTML 结构变化导致解析结果异常小或为零时拒绝覆盖稳定缓存。
- 组织只公开部分人员时必须把完整度写入来源登记，查询结果不得显示“否”。
- 同名冲突不得通过总被引次数或学校排名强行消解。

## 测试与验收

第一版需要覆盖以下测试：

- 姓名与论文 affiliation 一致时确认成功。
- 作者正常跳槽且官方履历与另一身份信号一致时确认成功。
- 常见姓名只有姓名命中时保持候选状态。
- 同名但研究方向或 ORCID 冲突时返回冲突状态。
- 普通 Member、Senior Member、Research Fellow 和博士后不进入 Fellow 缓存。
- 每个启用组织至少写入一条可由组织官网复核的记录，并同时登记官方来源与增量覆盖状态。
- 来源刷新失败不删除旧记录。
- 年度名单合并不覆盖历史年份。
- 稳定缓存、日期快照、姓名索引和组织计数一致。
- 现有 who-cite-your-works 测试继续通过。

## 非目标

- 第一版不建立全球所有科学院和学会的完整历史成员库。
- 不把普通学会会员、付费会员、编委、Research Fellow、Postdoctoral Fellow 或 Visiting Fellow 当作荣誉 Fellow。
- 不因为本地缓存未命中而生成否定性结论。
- 不在 Excel/Markdown 展示内部确认状态和来源编码；详细证据保留在 JSON。
