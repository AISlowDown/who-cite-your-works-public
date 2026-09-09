import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

test("skill preserves reusable knowledge without target-specific identities", async () => {
  const skill = await fs.readFile("SKILL.md", "utf8");
  const authorPolicy = await fs.readFile("references/author-title-honors-policy.md", "utf8");
  const combined = `${skill}\n${authorPolicy}`;

  assert.match(combined, /姓名.*论文署名机构.*研究方向/s);
  assert.match(combined, /姓名.*affiliation|affiliation.*姓名/i);
  assert.match(combined, /用户.*门槛.*覆盖|门槛.*可配置/s);
  assert.match(combined, />\s*5,?000/);
  for (const role of ["唯一第一作者", "共同第一作者", "唯一通讯作者", "共同通讯作者"]) {
    assert.ok(combined.includes(role), role);
  }
  assert.match(combined, /出版商.*PDF.*HTML|HTML.*PDF/s);
  assert.match(combined, /Europe PMC|PMC.*XML/i);
  assert.match(combined, /不截断.*引用原句|引用原句.*不截断/s);
  assert.match(combined, /重新打开.*XLSX|重开.*XLSX/s);
  assert.match(combined, /#REF!.*#DIV\/0!.*#VALUE!/s);
  assert.match(combined, /特定对象.*公开.*skill|公开.*skill.*特定对象/is);
});
