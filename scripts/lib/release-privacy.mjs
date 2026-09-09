import fs from "node:fs/promises";
import path from "node:path";

const textExtensions = new Set([".js", ".json", ".md", ".mjs", ".toml", ".txt", ".yaml", ".yml"]);
const ignoredDirectories = new Set([".git", ".worktrees", "node_modules"]);

async function listTextFiles(root) {
  const files = [];
  async function walk(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(target);
      else if (textExtensions.has(path.extname(entry.name).toLowerCase())) files.push(target);
    }
  }
  await walk(root);
  return files;
}

export async function auditReleaseTree(root, { privateIdentifiers = [] } = {}) {
  const findings = [];
  for (const file of await listTextFiles(root)) {
    const relativePath = path.relative(root, file);
    const text = await fs.readFile(file, "utf8");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (/(?:\/(?:Users|home)\/[^/\s]+\/|\/Volumes\/[^/\s]+\/|[A-Za-z]:\\Users\\[^\\\s]+\\)/.test(line)) {
        findings.push({ rule: "absolute-user-path", file: relativePath, line: index + 1 });
      }
      for (const identifier of privateIdentifiers.filter(Boolean)) {
        if (line.toLowerCase().includes(identifier.toLowerCase())) {
          findings.push({ rule: "private-identifier", file: relativePath, line: index + 1 });
        }
      }
    });
  }
  return findings;
}
