import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFellowCounts,
  buildFellowIndexes,
  mergeFellowRecords,
  validateFellowRecord,
  validateOfficialUrl,
  replaceObservedSourceSlice,
  buildCoverageMetrics,
  validateCoverageClaim,
  classifyRetirementStatus,
  isRetiredMembershipRecord,
  buildRetirementMetadataMetrics,
  replaceCompleteDirectorySlice,
} from "../scripts/lib/fellow-cache.mjs";

const source = {
  organizationId: "acs",
  officialDomains: ["acs.org"],
  acceptedGrades: ["ACS Fellow"],
};

const record = {
  id: "acs:2025:frances-h-arnold",
  name: "Frances H. Arnold",
  aliases: ["Frances H. Arnold"],
  organizationId: "acs",
  organization: "American Chemical Society",
  membershipGrade: "ACS Fellow",
  membershipGradeZh: "美国化学会会士",
  electionYear: 2025,
  listedAffiliations: ["California Institute of Technology"],
  status: "elected",
  sourceMode: "official-annual",
  coverage: "official-annual-2009-present",
  officialProfileUrl: null,
  officialListUrl: "https://www.acs.org/funding/awards/acs-fellows/fellows/2025-fellows.html",
  verifiedOn: "2026-09-02",
};

test("validates official source and Fellow record", () => {
  assert.equal(validateOfficialUrl(record.officialListUrl, source), true);
  assert.equal(validateOfficialUrl("https://example.com/fellows", source), false);
  assert.deepEqual(validateFellowRecord(record, source), []);
  assert.ok(validateFellowRecord({ ...record, membershipGrade: "Senior Member" }, source).length);
});

test("allows Member only when it is the formal grade of an engineering academy", () => {
  const source = { organizationId: "us-nae", officialDomains: ["nae.edu"], acceptedGrades: ["Member"],
    allowPlainMemberGrade: true };
  const record = { id: "us-nae:1", name: "Example Engineer", aliases: ["Example Engineer"],
    organizationId: "us-nae", organization: "National Academy of Engineering", membershipGrade: "Member",
    membershipGradeZh: "美国国家工程院院士", status: "current-public-directory", sourceMode: "official-directory",
    coverage: "official-current-directory", officialListUrl: "https://www.nae.edu/20412/MemberDirectory",
    officialProfileUrl: "https://www.nae.edu/1/Example", verifiedOn: "2026-09-05", listedAffiliations: [] };
  assert.deepEqual(validateFellowRecord(record, source), []);
});

test("replaces one corrected annual source slice without deleting other years", () => {
  const wrong = { ...record, id: "iwa:person:wrong", organizationId: "iwa", electionYear: 2024,
    officialListUrl: "https://www.iwa-network.org/news/class-2024", membershipGrade: "IWA Fellow" };
  const previousYear = { ...wrong, id: "iwa:person:2023", electionYear: 2023,
    officialListUrl: "https://www.iwa-network.org/news/class-2023" };
  const corrected = { ...wrong, id: "iwa:person:correct", membershipGrade: "IWA Distinguished Fellow" };
  const base = replaceObservedSourceSlice([wrong, previousYear], [corrected]);
  assert.deepEqual(base.map((row) => row.id), [previousYear.id]);
});

test("a validated complete directory replaces stale IDs for the same organization", () => {
  const stale = { ...record, id: "acs:encoded-old" };
  const other = { ...record, id: "iwa:keep", organizationId: "iwa" };
  assert.deepEqual(replaceCompleteDirectorySlice([stale, other], "acs"), [other]);
});

test("merges duplicates while retaining affiliations and election years", () => {
  const duplicate = { ...record, listedAffiliations: ["Caltech"] };
  const earlier = { ...record, id: "acs:2024:frances-h-arnold", electionYear: 2024 };
  const merged = mergeFellowRecords([record], [duplicate, earlier], "acs");
  assert.equal(merged.length, 2);
  assert.deepEqual(merged.find((row) => row.id === record.id).listedAffiliations.sort(),
    ["California Institute of Technology", "Caltech"].sort());
});

test("builds consistent name indexes and counts", () => {
  const second = { ...record, id: "acs:2025:second", name: "Second Person", aliases: ["Second Person"] };
  const records = [record, second];
  const index = buildFellowIndexes(records);
  const counts = buildFellowCounts(records);
  assert.deepEqual(index.francesharnold, [record.id]);
  assert.equal(counts.total, records.length);
  assert.equal(counts.byOrganization.acs, records.length);
});

test("builds coverage metrics with affiliation rate and observed years", () => {
  const rows = [record, { ...record, id: "acs:2024:second", name: "Second Person",
    aliases: ["Second Person"], electionYear: 2024, listedAffiliations: [] }];
  assert.deepEqual(buildCoverageMetrics(rows, { organizationId: "acs", coverageKind: "official-annual-complete",
    coverage: "official-annual-2009-present" }), {
    recordCount: 2,
    affiliationCount: 1,
    affiliationRate: 0.5,
    years: [2024, 2025],
    coverageClaim: "official-annual-2009-present",
  });
});

test("rejects a complete coverage claim below its safety minimum", () => {
  const metrics = buildCoverageMetrics([record], { organizationId: "acs", coverageKind: "official-directory-complete",
    coverage: "official-current-directory" });
  assert.deepEqual(validateCoverageClaim(metrics, { coverageKind: "official-directory-complete",
    expectedMinimum: 1000 }), ["coverage:unsafe-record-count:1<1000"]);
  assert.deepEqual(validateCoverageClaim(metrics, { coverageKind: "official-public-partial",
    expectedMinimum: 1000 }), []);
});

test("classifies explicit retirement metadata without inferring from age", () => {
  assert.equal(isRetiredMembershipRecord({ membershipGrade: "Emeritus" }), true);
  assert.equal(isRetiredMembershipRecord({ membershipGrade: "Lifetime Emeritus" }), true);
  assert.equal(isRetiredMembershipRecord({ employmentStatus: "retired" }), true);
  assert.equal(isRetiredMembershipRecord({ listedAffiliations: ["Example University (Retired)"] }), true);
  assert.equal(isRetiredMembershipRecord({ currentTitle: "Professor Emeritus" }), true);
  assert.equal(isRetiredMembershipRecord({ membershipGrade: "90+" }), false);
  assert.equal(isRetiredMembershipRecord({ membershipGrade: "Lifetime Fellow" }), false);
  assert.equal(isRetiredMembershipRecord({ membershipGradeZh: "中国科学院资深院士" }), false);
  assert.deepEqual(classifyRetirementStatus({ membershipGrade: "90+" }), {
    state: "not-explicitly-retired",
    evidence: null,
  });
  assert.deepEqual(buildRetirementMetadataMetrics([
    { organizationId: "us-nae", membershipGrade: "Emeritus" },
    { organizationId: "us-nae", membershipGrade: "Member" },
    { organizationId: "cae-canada", membershipGrade: "90+" },
  ]), { knownRetirementCount: 1, byOrganization: { "us-nae": 1 } });
});
