import assert from "node:assert/strict";
import test from "node:test";
import { enrichProfileMemberships, verifiedMembershipHonor } from "../scripts/lib/membership-profile-enrichment.mjs";

const makeCache = (records, coverage = "official-annual") => ({ records,
  byName: { examplescholar: records.map((record) => record.id) }, organizations: Object.fromEntries(
    records.map((record) => [record.organizationId, { coverage }])) });

test("combines verified academian and society honors with bullets", () => {
  const academyRecord = { id: "cas:example", name: "Example Scholar", aliases: ["Example Scholar"],
    academy: "中国科学院", memberType: "院士", listedAffiliations: ["Tsinghua University"] };
  const fellowRecords = [
    { id: "ieee:example", name: "Example Scholar", aliases: ["Example Scholar"], organizationId: "ieee",
      membershipGradeZh: "IEEE Fellow", listedAffiliations: ["Tsinghua University"] },
    { id: "rsc:example", name: "Example Scholar", aliases: ["Example Scholar"], organizationId: "rsc",
      membershipGradeZh: "英国皇家化学会会士", listedAffiliations: ["Tsinghua University"] },
  ];
  const result = enrichProfileMemberships({ author: { name: "Example Scholar" },
    paperAffiliations: ["Tsinghua University"], currentAffiliations: [], identitySignals: [],
    caches: { academicians: makeCache([academyRecord]), fellows: makeCache(fellowRecords) } });
  assert.equal(verifiedMembershipHonor(result), "中国科学院院士 • IEEE Fellow • 英国皇家化学会会士");
  assert.equal(result.academician, "中国科学院院士");
});

test("retains documented affiliation moves in evidence", () => {
  const record = { id: "ieee:mover", name: "Example Scholar", aliases: ["Example Scholar"],
    organizationId: "ieee", membershipGradeZh: "IEEE Fellow",
    listedAffiliations: ["Example University"] };
  const signals = [{ type: "career-history", sourceAuthority: "official",
    affiliations: ["McGill University", "Example University"] },
  { type: "orcid", sourceAuthority: "registry", value: "0000-0001" }];
  const result = enrichProfileMemberships({ author: { name: "Example Scholar", orcid: "0000-0001" },
    paperAffiliations: ["McGill University"], currentAffiliations: ["Example University"],
    identitySignals: signals, caches: { academicians: makeCache([]), fellows: makeCache([record], "official-incremental") } });
  assert.equal(result.membershipEvidence[0].confirmation.state, "verified_affiliation_change");
  assert.deepEqual(result.membershipEvidence[0].confirmation.paperAffiliations, ["McGill University"]);
  assert.deepEqual(result.membershipEvidence[0].confirmation.currentAffiliations,
    ["Example University"]);
});

test("excludes candidate, conflict and no-hit states from display honors", () => {
  const record = { id: "ieee:candidate", name: "Example Scholar", aliases: ["Example Scholar"],
    organizationId: "ieee", membershipGradeZh: "IEEE Fellow", listedAffiliations: [] };
  const result = enrichProfileMemberships({ author: { name: "Example Scholar" }, paperAffiliations: [],
    currentAffiliations: [], identitySignals: [], caches: { academicians: makeCache([]), fellows: makeCache([record]) } });
  assert.equal(verifiedMembershipHonor(result), "");
});
