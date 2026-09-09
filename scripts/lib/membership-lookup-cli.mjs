import fs from "node:fs/promises";
import { confirmMembershipIdentity, findMembershipCandidates } from "./identity-confirmation.mjs";

const repeatable = new Set(["affiliation", "current-affiliation", "research"]);
export const parseLookupArgs = (argv) => {
  const options = { affiliation: [], "current-affiliation": [], research: [] };
  const nameParts = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) { nameParts.push(value); continue; }
    const key = value.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for --${key}`);
    index += 1;
    if (repeatable.has(key)) options[key].push(next); else options[key] = next;
  }
  return { name: nameParts.join(" ").trim(), options };
};

const priority = { verified_same_affiliation: 5, verified_affiliation_change: 4, candidate_name_only: 3,
  conflict: 2, not_found_in_covered_cache: 1 };

export const runMembershipLookup = async ({ name, options, cache, candidateMapper = (value) => value,
  honorLabel = (candidate) => candidate.membershipGradeZh || candidate.membershipGrade }) => {
  const candidates = findMembershipCandidates({ name }, cache).map(candidateMapper);
  const identitySignals = options["identity-evidence"]
    ? JSON.parse(await fs.readFile(options["identity-evidence"], "utf8")) : [];
  const author = { name, paperAffiliations: options.affiliation || [],
    currentAffiliations: options["current-affiliation"] || [], orcid: options.orcid,
    research: options.research || [] };
  const results = candidates.map((candidate) => {
    const coverage = cache.organizations?.[candidate.organizationId]?.coverage || cache.scope || "unknown";
    return { candidate, confirmation: confirmMembershipIdentity({ author, candidate, identitySignals, coverage }) };
  });
  if (!results.length) results.push({ candidate: null, confirmation: confirmMembershipIdentity({
    author, candidate: null, identitySignals, coverage: cache.scope || "partial-cache",
  }) });
  results.sort((a, b) => priority[b.confirmation.state] - priority[a.confirmation.state]);
  const best = results[0].confirmation.state;
  const displayHonors = results.filter(({ confirmation }) => ["verified_same_affiliation", "verified_affiliation_change"]
    .includes(confirmation.state)).map(({ candidate }) => honorLabel(candidate)).filter(Boolean);
  return { query: name, verifiedOn: cache.verifiedOn || null, matchCount: candidates.length,
    candidates: results.map(({ candidate, confirmation }) => ({ record: candidate, confirmation })),
    confirmationState: best, coverage: results[0].confirmation.coverage,
    displayHonors: [...new Set(displayHonors)],
    note: best === "not_found_in_covered_cache" ? "未命中仅表示当前缓存未找到，不能据此认定不是 Fellow/院士"
      : "姓名命中只是候选；Honor 仅展示已通过机构双确认的结果，退休或荣休状态不作为排除条件" };
};
