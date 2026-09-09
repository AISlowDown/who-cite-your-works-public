import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

test("skill and references contain the complete membership verification policy", async () => {
  const files = await Promise.all(["SKILL.md", "references/international-fellows-cache.md",
    "references/chinese-academicians-cache.md", "references/author-title-honors-policy.md"]
    .map((file) => fs.readFile(file, "utf8")));
  const combined = files.join("\n");
  for (const organization of ["Royal Society", "IEEE", "AAAS", "IWA", "ASCE", "AIChE", "ACS", "RSC"]) {
    assert.match(combined, new RegExp(organization.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  for (const state of ["verified_same_affiliation", "verified_affiliation_change", "candidate_name_only",
    "conflict", "not_found_in_covered_cache"]) assert.ok(combined.includes(state), state);
  assert.match(combined, /机构变更|正常跳槽/);
  assert.match(combined, /保留旧缓存|旧记录/);
  assert.match(combined, /部分覆盖|增量覆盖/);
  assert.match(combined, /仅.*verified_same_affiliation.*verified_affiliation_change.*Honor/s);
  assert.match(combined, /官方公开最大覆盖/);
  assert.match(combined, /机构覆盖率/);
  assert.match(combined, /RSC[\s\S]*119[\s\S]*120/);
  assert.match(combined, /ASCE[\s\S]*3,846/);
  assert.match(combined, /profileFetchStatus/);
});

test("skill treats Chinese academicians as the primary honor source", async () => {
  const skill = await fs.readFile("SKILL.md", "utf8");
  assert.match(skill, /## 两院院士优先/);
  assert.match(skill, /中国科学院.*中国工程院.*第一优先级/s);
  assert.match(skill, /国外工程院.*补充/s);
  assert.match(skill, /论文署名机构.*优先补全/s);
});

test("skill preserves the time boundary of Chinese academician affiliation sources", async () => {
  const skill = await fs.readFile("SKILL.md", "utf8");
  assert.match(skill, /work-unit-before-election/);
  assert.match(skill, /currentAtSourceAffiliations/);
  assert.match(skill, /Common Crawl.*快照/s);
  assert.match(skill, /不.*写入.*currentAffiliations/s);
  assert.match(skill, /图片名单.*文字识别.*姓名.*当选年份/s);
});

test("skill treats retirement as optional metadata and never excludes an academian for it", async () => {
  const skill = await fs.readFile("SKILL.md", "utf8");
  assert.match(skill, /Emeritus.*Retired|Retired.*Emeritus/s);
  assert.match(skill, /原始.*保留|保留.*原始/s);
  assert.match(skill, /不.*年龄.*推断|不得.*年龄.*推断/s);
  assert.match(skill, /退休.*可选|可选.*退休/s);
  assert.match(skill, /不.*排除|不得.*排除/s);
  assert.doesNotMatch(skill, /retired_excluded/);
});
