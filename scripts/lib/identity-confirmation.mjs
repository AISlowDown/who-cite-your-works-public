import { normalizeAffiliation, normalizePersonName } from "./fellow-cache.mjs";

const aliases = new Map([
  ["caltech", "california institute of technology"],
  ["mit", "massachusetts institute of technology"],
]);

const generic = new Set(["the", "of", "and", "university", "institute", "institution", "technology",
  "college", "school", "academy", "department", "faculty", "research", "center", "centre"]);

const canonicalAffiliation = (value, extraAliases = {}) => {
  const normalized = normalizeAffiliation(value);
  const mapped = extraAliases[normalized] || aliases.get(normalized) || normalized;
  return normalizeAffiliation(mapped);
};

export const compareAffiliations = (left, right, extraAliases = {}) => {
  const leftNormalized = canonicalAffiliation(left, extraAliases);
  const rightNormalized = canonicalAffiliation(right, extraAliases);
  if (!leftNormalized || !rightNormalized) return { matched: false, overlap: [] };
  if (leftNormalized === rightNormalized) return { matched: true, method: "canonical-exact", overlap: [leftNormalized] };
  const leftTokens = new Set(leftNormalized.split(" ").filter((token) => token.length > 2 && !generic.has(token)));
  const rightTokens = new Set(rightNormalized.split(" ").filter((token) => token.length > 2 && !generic.has(token)));
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token));
  const required = Math.max(2, Math.min(leftTokens.size, rightTokens.size));
  const contained = leftNormalized.length > 8 && rightNormalized.length > 8
    && (leftNormalized.includes(rightNormalized) || rightNormalized.includes(leftNormalized));
  return { matched: contained || overlap.length >= required, method: contained ? "canonical-contained" : "token-overlap", overlap };
};

export const findMembershipCandidates = ({ name, aliases: queryAliases = [] }, cache) => {
  const ids = new Set();
  for (const value of [name, ...queryAliases]) {
    for (const id of cache?.byName?.[normalizePersonName(value)] || []) ids.add(id);
  }
  const records = new Map((cache?.records || []).map((record) => [record.id, record]));
  return [...ids].map((id) => records.get(id)).filter(Boolean);
};

const anyAffiliationMatch = (left = [], right = [], aliasMap = {}) => {
  const matches = [];
  for (const a of left) for (const b of right) {
    const comparison = compareAffiliations(a, b, aliasMap);
    if (comparison.matched) matches.push({ left: a, right: b, ...comparison });
  }
  return matches;
};

const tokenSet = (values = []) => new Set(values.flatMap((value) => normalizeAffiliation(value).split(" "))
  .filter((token) => token.length > 3 && !generic.has(token)));

export const confirmMembershipIdentity = ({ author = {}, candidate, identitySignals = [], coverage = "unknown", affiliationAliases = {} }) => {
  const paperAffiliations = author.paperAffiliations || author.affiliations || [];
  const currentAffiliations = author.currentAffiliations || [];
  const base = {
    state: "not_found_in_covered_cache",
    candidateId: candidate?.id || null,
    matchedAffiliations: [],
    paperAffiliations,
    currentAffiliations,
    signalsUsed: [],
    conflicts: [],
    coverage,
  };
  if (!candidate) return base;

  const candidateNames = [candidate.name, ...(candidate.aliases || [])].map(normalizePersonName);
  if (!candidateNames.includes(normalizePersonName(author.name))) {
    return { ...base, state: "conflict", conflicts: ["name-mismatch"] };
  }
  if (author.orcid && candidate.orcid && normalizePersonName(author.orcid) !== normalizePersonName(candidate.orcid)) {
    return { ...base, state: "conflict", conflicts: ["orcid-mismatch"] };
  }
  const authorResearch = tokenSet(author.research || []);
  const candidateResearch = tokenSet(candidate.research || []);
  if (authorResearch.size && candidateResearch.size && ![...authorResearch].some((token) => candidateResearch.has(token))) {
    return { ...base, state: "conflict", conflicts: ["research-field-conflict"] };
  }

  const listed = candidate.listedAffiliations || [];
  const sameMatches = anyAffiliationMatch(paperAffiliations, listed, affiliationAliases);
  if (sameMatches.length) {
    return { ...base, state: "verified_same_affiliation", matchedAffiliations: sameMatches,
      signalsUsed: [{ type: "paper-listed-affiliation", sourceAuthority: "official" }] };
  }

  const currentMatches = anyAffiliationMatch(currentAffiliations, listed, affiliationAliases);
  const officialCareerSignals = identitySignals.filter((signal) => signal.sourceAuthority === "official"
    && anyAffiliationMatch(paperAffiliations, signal.affiliations || [], affiliationAliases).length
    && anyAffiliationMatch(currentAffiliations, signal.affiliations || [], affiliationAliases).length);
  const supportiveSignals = identitySignals.filter((signal) => {
    if (signal.type === "orcid") return !author.orcid || normalizePersonName(signal.value) === normalizePersonName(author.orcid);
    return signal.matched === true || (signal.affiliations || []).length > 0;
  });
  if (currentMatches.length && officialCareerSignals.length && supportiveSignals.length >= 2) {
    return { ...base, state: "verified_affiliation_change", matchedAffiliations: currentMatches,
      signalsUsed: supportiveSignals };
  }
  return { ...base, state: "candidate_name_only" };
};
