import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const run = (script, args) => {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
};

test("lookup CLIs expose confirmation state and only display verified honors", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "membership-cli-"));
  const fellowPath = path.join(dir, "fellows.json");
  const evidencePath = path.join(dir, "evidence.json");
  const record = { id: "acs:frances", name: "Frances H. Arnold", aliases: ["Frances H. Arnold"],
    organizationId: "acs", organization: "American Chemical Society", membershipGrade: "ACS Fellow",
    membershipGradeZh: "美国化学会会士", listedAffiliations: ["California Institute of Technology"] };
  await fs.writeFile(fellowPath, JSON.stringify({ verifiedOn: "2026-09-02", records: [record],
    byName: { francesharnold: [record.id] }, organizations: { acs: { coverage: "official-annual" } } }));
  await fs.writeFile(evidencePath, JSON.stringify([{ type: "career-history", sourceAuthority: "official",
    affiliations: ["McGill University", "Example University"] },
  { type: "orcid", sourceAuthority: "registry", value: "0000-0001" }]));

  const verified = run("scripts/lookup-fellow.mjs", ["Frances H. Arnold", "--affiliation", "Caltech", "--cache", fellowPath]);
  assert.equal(verified.confirmationState, "verified_same_affiliation");
  assert.deepEqual(verified.displayHonors, ["美国化学会会士"]);

  const nameOnly = run("scripts/lookup-fellow.mjs", ["Frances H. Arnold", "--cache", fellowPath]);
  assert.equal(nameOnly.confirmationState, "candidate_name_only");
  assert.deepEqual(nameOnly.displayHonors, []);

  const mover = { ...record, id: "acs:mover", name: "Example Mover", aliases: ["Example Mover"],
    listedAffiliations: ["Example University"] };
  await fs.writeFile(fellowPath, JSON.stringify({ records: [mover], byName: { examplemover: [mover.id] },
    organizations: { acs: { coverage: "official-incremental" } } }));
  const moved = run("scripts/lookup-fellow.mjs", ["Example Mover", "--affiliation", "McGill University",
    "--current-affiliation", "Example University", "--orcid", "0000-0001",
    "--identity-evidence", evidencePath, "--cache", fellowPath]);
  assert.equal(moved.confirmationState, "verified_affiliation_change");
  assert.equal(moved.displayHonors.length, 1);
});

test("academician lookup uses the same affiliation confirmation contract", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "academician-cli-"));
  const cachePath = path.join(dir, "academicians.json");
  const record = { id: "cas:test", name: "同名示例", aliases: ["同名示例"], academy: "中国科学院",
    memberType: "院士", listedAffiliations: ["引用论文机构"] };
  await fs.writeFile(cachePath, JSON.stringify({ records: [record], byName: { 同名示例: [record.id] },
    scope: "中国科学院官方名单" }));
  const result = run("scripts/lookup-academician.mjs", ["同名示例", "--affiliation", "引用论文机构", "--cache", cachePath]);
  assert.equal(result.confirmationState, "verified_same_affiliation");
  assert.deepEqual(result.displayHonors, ["中国科学院院士"]);
});

test("lookup preserves and displays a verified emeritus member without excluding it", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "retired-membership-cli-"));
  const cachePath = path.join(dir, "fellows.json");
  const record = { id: "us-nae:retired", name: "Example Retired", aliases: ["Example Retired"],
    organizationId: "us-nae", organization: "National Academy of Engineering",
    membershipGrade: "Emeritus", membershipGradeZh: "美国国家工程院荣休院士",
    employmentStatus: "retired", retirementEvidence: "official membership grade: Emeritus",
    listedAffiliations: ["Example University"] };
  await fs.writeFile(cachePath, JSON.stringify({ records: [record], byName: { exampleretired: [record.id] },
    organizations: { "us-nae": { coverage: "official-current-directory" } } }));
  const result = run("scripts/lookup-fellow.mjs", ["Example Retired", "--affiliation", "Example University",
    "--cache", cachePath]);
  assert.equal(result.matchCount, 1);
  assert.equal(result.confirmationState, "verified_same_affiliation");
  assert.deepEqual(result.displayHonors, ["美国国家工程院荣休院士"]);
  assert.equal(result.candidates[0].record.membershipGrade, "Emeritus");
});

test("academician lookup retains a verified member with a retired position", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "retired-academician-cli-"));
  const cachePath = path.join(dir, "academicians.json");
  const record = { id: "cae:test-retired", name: "退休示例", aliases: ["退休示例"], academy: "中国工程院",
    memberType: "外籍院士", listedAffiliations: ["示例大学退休荣誉教授"] };
  await fs.writeFile(cachePath, JSON.stringify({ records: [record], byName: { 退休示例: [record.id] },
    scope: "中国工程院官方名单" }));
  const result = run("scripts/lookup-academician.mjs", ["退休示例", "--affiliation", "示例大学退休荣誉教授",
    "--cache", cachePath]);
  assert.equal(result.confirmationState, "verified_same_affiliation");
  assert.deepEqual(result.displayHonors, ["中国工程院外籍院士"]);
});
