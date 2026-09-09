import assert from "node:assert/strict";
import test from "node:test";

const blankProfile = {
  formalTitle: "官网简历未列示", currentPosition: "官网简历未列示", professorStatus: "待核验",
  academician: "官网简历未列示", youthScienceFundClassA: "官网简历未列示",
  youthScienceFundClassB: "官网简历未列示", overseasExcellentYoungScientists: "官网简历未列示",
  changjiangScholar: "官网简历未列示", otherNationalLeadingTalent: "官网简历未列示",
  otherNationalYoungTalent: "官网简历未列示", provincialMinisterialTalent: "官网简历未列示",
  institutionalTalent: "官网简历未列示", otherHonors: "官网简历未列示",
  verificationStatus: "待核验",
};

const cache = {
  stats: { pendingCount: 0 },
  authors: [
    { openalexId: "https://openalex.org/A000000001", name: "Researcher Alpha", profileVerification: { ...blankProfile, formalTitle: "教授", professorStatus: "是", verificationStatus: "已核验职称" } },
    { openalexId: "https://openalex.org/A000000002", name: "Researcher Beta", profileVerification: { ...blankProfile, verificationStatus: "身份冲突" } },
    { openalexId: "https://openalex.org/A000000003", name: "Researcher Gamma", profileVerification: { ...blankProfile, formalTitle: "教授", professorStatus: "是", changjiangScholar: "教育部长江学者特聘教授", verificationStatus: "已核验职称" } },
  ],
};

test("Top100 author profiles separate formal title, position, and talent tiers", () => {
  const required = ["formalTitle", "currentPosition", "professorStatus", "academician", "youthScienceFundClassA", "youthScienceFundClassB", "overseasExcellentYoungScientists", "changjiangScholar", "otherNationalLeadingTalent", "otherNationalYoungTalent", "provincialMinisterialTalent", "institutionalTalent", "otherHonors"];
  for (const author of cache.authors) for (const field of required) assert.ok(Object.hasOwn(author.profileVerification, field), `${author.name} missing ${field}`);
});

test("a professor title is not silently converted into a national talent title", () => {
  const profile = cache.authors[0].profileVerification;
  assert.equal(profile.formalTitle, "教授");
  assert.equal(profile.otherNationalLeadingTalent, "官网简历未列示");
});

test("profile records preserve conflicts and verified talent fields separately", () => {
  const byId = new Map(cache.authors.map((author) => [author.openalexId, author]));
  assert.equal(byId.get("https://openalex.org/A000000002").profileVerification.verificationStatus, "身份冲突");
  assert.equal(byId.get("https://openalex.org/A000000003").profileVerification.changjiangScholar, "教育部长江学者特聘教授");
  assert.equal(cache.stats.pendingCount, 0);
});
