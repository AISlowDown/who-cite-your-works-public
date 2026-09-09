import assert from "node:assert/strict";
import test from "node:test";
import { compareAffiliations, confirmMembershipIdentity } from "../scripts/lib/identity-confirmation.mjs";

const candidate = {
  id: "acs:2025:frances-h-arnold",
  name: "Frances H. Arnold",
  aliases: ["Frances H. Arnold"],
  listedAffiliations: ["California Institute of Technology"],
  organizationId: "acs",
};

test("confirms equivalent paper and listed affiliations", () => {
  assert.equal(compareAffiliations("Caltech", "California Institute of Technology").matched, true);
  const result = confirmMembershipIdentity({
    author: { name: "Frances H. Arnold", paperAffiliations: ["Caltech"] },
    candidate,
    identitySignals: [],
    coverage: "official-annual-2009-present",
  });
  assert.equal(result.state, "verified_same_affiliation");
});

test("confirms an affiliation move only with an official signal and another identity signal", () => {
  const movingCandidate = { ...candidate, name: "Example Mover", aliases: ["Example Mover"],
    listedAffiliations: ["Example University"] };
  const result = confirmMembershipIdentity({
    author: { name: "Example Mover", paperAffiliations: ["McGill University"],
      currentAffiliations: ["Example University"], orcid: "0000-0001" },
    candidate: movingCandidate,
    identitySignals: [
      { type: "career-history", sourceAuthority: "official", affiliations: ["McGill University", "Example University"] },
      { type: "orcid", sourceAuthority: "registry", value: "0000-0001" },
    ],
    coverage: "official-incremental",
  });
  assert.equal(result.state, "verified_affiliation_change");
});

test("keeps name-only matches as candidates", () => {
  const result = confirmMembershipIdentity({ author: { name: candidate.name }, candidate,
    identitySignals: [], coverage: "official-annual" });
  assert.equal(result.state, "candidate_name_only");
});

test("treats ORCID mismatch and incompatible field as conflict", () => {
  const result = confirmMembershipIdentity({
    author: { name: candidate.name, orcid: "0000-A", research: ["materials engineering"] },
    candidate: { ...candidate, orcid: "0000-B", research: ["astrophysics"] },
    identitySignals: [], coverage: "official-annual",
  });
  assert.equal(result.state, "conflict");
});

test("reports a coverage-qualified no-hit", () => {
  const result = confirmMembershipIdentity({ author: { name: "Nobody" }, candidate: null,
    identitySignals: [], coverage: "official-incremental" });
  assert.equal(result.state, "not_found_in_covered_cache");
  assert.equal(result.coverage, "official-incremental");
});

test("rejects generic-token affiliation matches and non-official move evidence", () => {
  assert.equal(compareAffiliations("University Institute", "Technology University").matched, false);
  const result = confirmMembershipIdentity({
    author: { name: "Example Mover", paperAffiliations: ["McGill University"],
      currentAffiliations: ["Example University"] },
    candidate: { ...candidate, name: "Example Mover", aliases: ["Example Mover"],
      listedAffiliations: ["Example University"] },
    identitySignals: [
      { type: "career-history", sourceAuthority: "aggregator", affiliations: ["McGill University"] },
      { type: "research", sourceAuthority: "publisher", matched: true },
    ], coverage: "official-incremental",
  });
  assert.equal(result.state, "candidate_name_only");
});
