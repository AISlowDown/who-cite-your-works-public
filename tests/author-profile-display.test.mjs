import assert from "node:assert/strict";
import test from "node:test";

import { compactHonor, compactTitle } from "../scripts/lib/author-profile-display.mjs";

test("compactTitle keeps one readable title string", () => {
  assert.equal(compactTitle({ formalTitle: "教授", currentPosition: "清华大学环境学院长聘教授、院长" }), "长聘教授");
  assert.equal(compactTitle({ formalTitle: "教授", currentPosition: "数字建造讲席教授、香港大学房地产及建设系系主任" }), "讲席教授");
  assert.equal(compactTitle({ formalTitle: "副教授", currentPosition: "待核验" }), "副教授");
});

test("compactHonor joins domestic and international honors with bullets", () => {
  const profile = {
    academician: "美国国家发明家科学院会士（NAI Fellow；不等同中外科学院院士）",
    youthScienceFundClassA: "官网简历未列示",
    youthScienceFundClassB: "官网简历未列示",
    overseasExcellentYoungScientists: "官网简历未列示",
    changjiangScholar: "官网简历未列示",
    otherNationalLeadingTalent: "国家万人计划科技创新领军人才",
    otherNationalYoungTalent: "官网简历未列示",
    provincialMinisterialTalent: "深圳市孔雀计划C类",
    institutionalTalent: "官网简历未列示",
    otherHonors: "IEEE Fellow；科睿唯安高被引科学家",
    verificationStatus: "已核验职称",
  };

  assert.equal(
    compactHonor(profile),
    "美国国家发明家科学院会士（NAI Fellow；不等同中外科学院院士） • 国家万人计划科技创新领军人才 • 深圳市孔雀计划C类 • IEEE Fellow • 科睿唯安高被引科学家",
  );
});

test("compactHonor preserves unresolved status without repeated placeholders", () => {
  assert.equal(compactHonor({ verificationStatus: "待核验" }), "待核验");
  assert.equal(compactHonor({ verificationStatus: "身份冲突" }), "身份冲突");
  assert.equal(compactHonor({ verificationStatus: "证据不足" }), "证据不足");
  assert.equal(compactHonor({ verificationStatus: "已核验职称" }), "官网未列示");
});
