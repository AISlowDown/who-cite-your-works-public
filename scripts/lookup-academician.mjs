import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseLookupArgs, runMembershipLookup } from "./lib/membership-lookup-cli.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
try {
  const { name, options } = parseLookupArgs(process.argv.slice(2));
  if (!name) throw new Error("Usage: node scripts/lookup-academician.mjs <name> [--affiliation <institution>] [--current-affiliation <institution>] [--orcid <id>] [--research <keywords>] [--identity-evidence <json>] [--cache <json>]");
  const cachePath = path.resolve(options.cache || path.join(root, "data", "chinese-academicians-cache.json"));
  const raw = JSON.parse(await fs.readFile(cachePath, "utf8"));
  const cache = { ...raw, organizations: raw.organizations || {} };
  const candidateMapper = (record) => ({ ...record, organizationId: record.academy || "chinese-academy",
    organization: record.academy, membershipGrade: record.memberType,
    membershipGradeZh: `${record.academy}${record.memberType === "院士" ? "院士" : record.memberType}`,
    listedAffiliations: record.listedAffiliations || [] });
  console.log(JSON.stringify(await runMembershipLookup({ name, options, cache, candidateMapper,
    honorLabel: (candidate) => candidate.membershipGradeZh }), null, 2));
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
