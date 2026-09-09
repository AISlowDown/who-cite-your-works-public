# 重点作者引文抓取

## 执行

```sh
node scripts/collect-target-citation-comments.mjs --input candidates.json --output comments.json --goal 10
node scripts/collect-target-citation-comments.mjs --input candidates.json --output comments.json --previous earlier-comments.json --goal 10 --cache-dir private-fulltext-cache
```

兼容原有 `<slug> <researcher> [date]` 位置参数，默认目标 10 人。显式输入须同时给出输出地址；不要向公开 skill 目录写入个人数据。输入的 `strictCandidates` 是已按本次门槛、机构、作者角色筛选和消歧后的记录，不接受未经筛选的候选列表。脚本再次剔除目标作者 ID 出现在引用论文作者名单中的自引。旧缓存没有明确核验状态的原文保留，但不自动升级为已核验。

每条记录使用现有 `citingAuthor`、`citingWork`、`targetWork` 结构。`citingWork.fullTextUrls` 可额外提供经确认合法可访问的出版社或大学知识库全文 URL；已有 `landingPageUrl`、`doi`、`pdfUrl` 自动尝试。不同作者可以共享同一论文对的原文缓存，计数仍按不同作者统计。

## 抓取与核验

1. 复用已核验原文缓存；按作者总被引降序逐位处理，每人处理其全部已发现引用论文。失败后继续补位；达到目标停止新增未达标作者，仍处理已计入作者的其他论文。
2. 获取出版社/提供的全文 URL，发现 `citation_pdf_url` 和 `citation_fulltext_html_url` 元数据链接。PDF 需要本机 `pdftotext`；缺少该程序时记录解析失败，不冒充成功。
3. 核对引用论文 DOI 和题名。在 HTML/JATS XML 中定位目标参考文献及正文链接；参考文献不含 DOI 时，需由 Crossref 的目标 DOI 信息核对题名、第一作者姓氏和发表年份；含冲突 DOI 时拒绝匹配。PDF 支持明确的 References/Bibliography、方括号编号文献和正文对应编号；扫描版、作者—年份式、复杂跨栏或混合编号不自动判定通过。
4. 按引用论文 DOI 搜索 Europe PMC 开放全文 XML。最后查询 Semantic Scholar 的引用上下文并跟随 `next` 分页；达到分页上限或中途失败保留前页结果并明确未完成。聚合上下文保留完整字符串，但在未核对对应位置前只是候选，不计入达标人数。
5. 联网请求带超时与有限重试；不绕过付费墙。全文按 URL 哈希缓存在私有目录；每个论文对处理后原子保存进度。异常页面缓存可能需用户检查后移除该单个缓存再试，不应清空成功证据。跨日补查用 `--previous`。

## 输出和人工解读边界

`comments` 保持论文对键，包含原文、所有定位到的上下文、位置、来源 URL、核验方法及逐来源尝试记录；成功旧证据不被失败覆盖。`summary` 包含目标人数、已核验原文作者数、是否达标、缺口、已处理作者和未解决论文对。回填两个 Excel 索引时，不能把未进入本轮、无上下文、访问失败、候选原句混成同一种状态。

`verified: true` 表示已完成引文对应关系核验，不是自动判断“高度评价”。自动提取后仍须审读原句，补充准确中文解释和用途分类。人工完成核验时，保留来源、引用论文/目标论文对应关系和核验方法，再设置 `verified: true`；不得只为满足人数修改此字段。共享同一论文证据不能写成多个独立评价。

此版本不承诺通吃所有出版社、不自动搜索整个互联网知识库、不执行扫描件 OCR，也不保证每次均能取得 10 人。合法全文候选可增补至 `fullTextUrls`；无法确定原文时交付实际进展及原因。`refresh-citation-comments.mjs` 是兼容旧记录的聚合上下文刷新器，不代替本抓取入口或 Top 10 验收。

接口参考：[Semantic Scholar 分页](https://api.semanticscholar.org/api-docs/snippets)、[Europe PMC 开放全文](https://europepmc.org/RestfulWebService)。
