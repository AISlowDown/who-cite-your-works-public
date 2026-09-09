import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseLookupArgs, runMembershipLookup } from "./lib/membership-lookup-cli.mjs";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
try {
  const { name, options } = parseLookupArgs(process.argv.slice(2));
  if (!name) throw new Error("Usage: node scripts/lookup-fellow.mjs <name> [--affiliation <institution>] [--current-affiliation <institution>] [--orcid <id>] [--research <keywords>] [--identity-evidence <json>] [--cache <json>]");
  const cachePath = path.resolve(options.cache || path.join(root, "data", "international-fellows-cache.json"));
  const cache = JSON.parse(await fs.readFile(cachePath, "utf8"));
  console.log(JSON.stringify(await runMembershipLookup({ name, options, cache }), null, 2));
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
