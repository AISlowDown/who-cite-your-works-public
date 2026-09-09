import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { auditReleaseTree } from "../scripts/lib/release-privacy.mjs";

test("release privacy audit reports local home paths and configured private identifiers", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "citation-radar-privacy-"));
  await fs.mkdir(path.join(root, "scripts"));
  const privatePath = ["", "Users", "private-user", "research"].join("/");
  await fs.writeFile(path.join(root, "SKILL.md"), `Data: ${privatePath}\n`, "utf8");
  await fs.writeFile(path.join(root, "scripts", "run.mjs"), "const researcher = 'Private Researcher';\n", "utf8");

  const findings = await auditReleaseTree(root, { privateIdentifiers: ["Private Researcher"] });

  assert.deepEqual(findings.map((item) => item.rule).sort(), ["absolute-user-path", "private-identifier"]);
});

test("release privacy audit accepts portable paths and public cache data", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "citation-radar-public-"));
  await fs.mkdir(path.join(root, "scripts"));
  await fs.mkdir(path.join(root, "data"));
  await fs.writeFile(path.join(root, "SKILL.md"), "Use CITATION_RADAR_DATA_DIR or an explicit input path.\n", "utf8");
  await fs.writeFile(path.join(root, "scripts", "run.mjs"), "const input = process.argv[2];\n", "utf8");
  await fs.writeFile(path.join(root, "data", "public-roster.json"), '{"name":"Public Fellow"}\n', "utf8");

  const findings = await auditReleaseTree(root, { privateIdentifiers: ["Private Researcher"] });

  assert.deepEqual(findings, []);
});

test("release privacy audit does not hide private identifiers placed in data", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "citation-radar-data-privacy-"));
  await fs.mkdir(path.join(root, "data"));
  await fs.writeFile(path.join(root, "data", "target-author.json"), '{"name":"Private Researcher"}\n', "utf8");

  const findings = await auditReleaseTree(root, { privateIdentifiers: ["Private Researcher"] });

  assert.deepEqual(findings.map((item) => item.rule), ["private-identifier"]);
});

test("release privacy audit recognizes macOS volume and Windows user paths", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "citation-radar-path-privacy-"));
  const volumePath = ["", "Volumes", "Research", "private.json"].join("/");
  const windowsPath = ["C:", "Users", "private-user", "report.xlsx"].join("\\");
  await fs.writeFile(path.join(root, "README.md"), `Input: ${volumePath}\nOutput: ${windowsPath}\n`, "utf8");

  const findings = await auditReleaseTree(root);

  assert.deepEqual(findings.map((item) => item.rule), ["absolute-user-path", "absolute-user-path"]);
});
