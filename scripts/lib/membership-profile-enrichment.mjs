import { confirmMembershipIdentity, findMembershipCandidates } from "./identity-confirmation.mjs";

const verifiedStates = new Set(["verified_same_affiliation", "verified_affiliation_change"]);
const unique = (values) => [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];

const academyCandidate = (record) => ({ ...record, organizationId: record.organizationId || record.academy || "chinese-academy",
  organization: record.organization || record.academy, membershipGrade: record.membershipGrade || record.memberType,
  membershipGradeZh: record.membershipGradeZh || `${record.academy}${record.memberType === "院士" ? "院士" : record.memberType}`,
  listedAffiliations: record.listedAffiliations || [] });

export const enrichProfileMemberships = ({ author = {}, paperAffiliations = [], currentAffiliations = [],
  identitySignals = [], caches = {}, existingProfile = {} }) => {
  const evidence = [];
  const queryAuthor = { ...author, paperAffiliations, currentAffiliations };
  const academyCandidates = findMembershipCandidates({ name: author.name, aliases: author.aliases || [] },
    caches.academicians || {}).map(academyCandidate);
  const fellowCandidates = findMembershipCandidates({ name: author.name, aliases: author.aliases || [] },
    caches.fellows || {});

  for (const [kind, candidates, cache] of [["academician", academyCandidates, caches.academicians || {}],
    ["fellow", fellowCandidates, caches.fellows || {}]]) {
    for (const candidate of candidates) {
      const coverage = cache.organizations?.[candidate.organizationId]?.coverage || cache.scope || "partial-cache";
      evidence.push({ kind, candidate, confirmation: confirmMembershipIdentity({
        author: queryAuthor, candidate, identitySignals, coverage,
      }) });
    }
  }

  const verified = evidence.filter((row) => verifiedStates.has(row.confirmation.state));
  const academicians = unique(verified.filter((row) => row.kind === "academician")
    .map((row) => row.candidate.membershipGradeZh));
  const fellows = unique(verified.filter((row) => row.kind === "fellow")
    .map((row) => row.candidate.membershipGradeZh || row.candidate.membershipGrade));
  const existingOther = String(existingProfile.otherHonors || "").split(/[；•]/).map((value) => value.trim());
  return { academician: unique([existingProfile.academician, ...academicians]).join(" • "),
    otherHonors: unique([...existingOther, ...fellows]).join("；"), verifiedHonors: unique([...academicians, ...fellows]),
    membershipEvidence: evidence };
};

export const verifiedMembershipHonor = (result = {}) => unique(result.verifiedHonors || []).join(" • ");
