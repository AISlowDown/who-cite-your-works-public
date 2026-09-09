# Membership Directories V2 Design

## Goal

补齐中国科学院和中国工程院院士的官方机构/履历信息，并将 IEEE、AAAS、ASCE、AIChE 和 RSC Fellow 扩展到官方公开来源可支持的最大覆盖范围。

## “完整名单”的可验证定义

- 官网公开当前全量目录：缓存该目录的全部可见记录。
- 官网仅公开年度名单：按年份建立覆盖矩阵，补齐所有可获年份，不宣称包含未公开年份。
- 官网目录需登录或受隐私选项限制：仅缓存官方公开可见集，在 `coverage` 中写明边界。
- 官网不提供普通 Fellow 全量目录：不使用第三方拼凑成“完整”；可将官方完整的子类别（如 RSC Honorary Fellows）单独建模，普通 FRSC 保持官方增量。

## 官方来源边界

- 两院院士：名单页确定人员集，官方个人页补充 `listedAffiliations`、`currentAffiliations`、`careerAffiliations`、`specialty`、`profileEvidence`。
- IEEE：官方 Fellow Directory 的公开可见集加官方年度 elevated classes；不绕过登录或隐私限制。
- AAAS：官方当前/年度 PDF 和 program PDF，保留年份、section、机构与原文定位。
- ASCE：Official Register 用于总数和政策校验；人名来自官方公开目录/年度晋升公告。Register 只有总数而无名单时不生成虚构记录。
- AIChE：官方 2018 历史全量 PDF 加 2019 年以后官方 New Fellows 记录。
- RSC：普通 FRSC 无官方公开全量目录时仅保存官方个人页/可验证数字凭证；Honorary Fellow 作为独立等级缓存官方当前完整名单。

## 质量门槛

- 缓存刷新采用原子写入，失败、零行、异常缩水或解析噪声时保留旧版。
- 每条记录至少保留官方 URL、来源日期、抽取定位和覆盖类型。
- 名称规范化不删除原始名称；同名候选不合并。
- 院士/Fellow 的 Honor 仍需姓名加论文署名机构双确认。
- 缓存报告必须同时报告记录数、覆盖年份、机构字段覆盖率、未公开边界和失败来源。
