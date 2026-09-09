const excludedGrades = /^(?:member|senior member|research fellow|postdoctoral fellow|visiting fellow)$/i;
const explicitRetirement = /\b(?:emeritus|retired)\b|荣休|退休/i;

export const normalizePersonName = (value = "") => String(value)
  .normalize("NFKD")
  .replace(/\p{M}/gu, "")
  .replace(/[^\p{L}\p{N}]/gu, "")
  .toLowerCase();

export const normalizeAffiliation = (value = "") => String(value)
  .normalize("NFKD")
  .replace(/\p{M}/gu, "")
  .replace(/&/g, " and ")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .trim()
  .toLowerCase();

export const classifyRetirementStatus = (record = {}) => {
  const explicitStatus = String(record.employmentStatus || record.memberStatus || "").trim();
  if (/^(?:retired|emeritus)$/i.test(explicitStatus)) {
    return { state: "retired", evidence: record.retirementEvidence || `official status: ${explicitStatus}` };
  }
  for (const [field, value] of [["membershipGrade", record.membershipGrade],
    ["membershipGradeZh", record.membershipGradeZh], ["currentTitle", record.currentTitle],
    ["formalTitle", record.formalTitle], ["currentPosition", record.currentPosition],
    ["listedAffiliations", (record.listedAffiliations || []).join(" • ")],
    ["currentAffiliations", (record.currentAffiliations || []).join(" • ")]]) {
    if (explicitRetirement.test(String(value || ""))) {
      return { state: "retired", evidence: record.retirementEvidence || `official ${field}: ${value}` };
    }
  }
  return { state: "not-explicitly-retired", evidence: null };
};

export const isRetiredMembershipRecord = (record = {}) => classifyRetirementStatus(record).state === "retired";

export const withRetirementMetadata = (record = {}) => {
  const classification = classifyRetirementStatus(record);
  return { ...record, employmentStatus: classification.state,
    retirementEvidence: classification.evidence || null };
};

export const buildRetirementMetadataMetrics = (records = []) => {
  const retired = records.filter(isRetiredMembershipRecord);
  const byOrganization = {};
  for (const record of retired) {
    byOrganization[record.organizationId] = (byOrganization[record.organizationId] || 0) + 1;
  }
  return { knownRetirementCount: retired.length, byOrganization };
};

export const validateOfficialUrl = (value, sourceConfig) => {
  if (!value) return true;
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return (sourceConfig.officialDomains || []).some((domain) =>
      hostname === domain || hostname.endsWith(`.${domain}`));
  } catch {
    return false;
  }
};

export const validateFellowRecord = (record, sourceConfig) => {
  const errors = [];
  for (const key of ["id", "name", "organizationId", "organization", "membershipGrade",
    "membershipGradeZh", "status", "sourceMode", "coverage", "officialListUrl", "verifiedOn"]) {
    if (record?.[key] == null || record[key] === "") errors.push(`missing:${key}`);
  }
  if (record?.organizationId !== sourceConfig.organizationId) errors.push("organizationId:mismatch");
  if (!(sourceConfig.acceptedGrades || []).includes(record?.membershipGrade)) errors.push("membershipGrade:not-allowed");
  if (excludedGrades.test(record?.membershipGrade || "") && !(sourceConfig.allowPlainMemberGrade
    && /^member$/i.test(record?.membershipGrade || ""))) errors.push("membershipGrade:excluded");
  if (!Array.isArray(record?.aliases) || !record.aliases.length) errors.push("aliases:empty");
  if (!Array.isArray(record?.listedAffiliations)) errors.push("listedAffiliations:not-array");
  for (const key of ["officialListUrl", "officialProfileUrl"]) {
    if (!validateOfficialUrl(record?.[key], sourceConfig)) errors.push(`${key}:non-official`);
  }
  if (record?.electionYear != null && (!Number.isInteger(record.electionYear)
    || record.electionYear < 1600 || record.electionYear > new Date().getUTCFullYear() + 1)) {
    errors.push("electionYear:invalid");
  }
  return errors;
};

const mergeUnique = (...groups) => [...new Set(groups.flat().filter(Boolean).map((value) => String(value).trim()))];

export const mergeFellowRecords = (existingRecords = [], fetchedRecords = [], organizationId) => {
  const untouched = existingRecords.filter((record) => record.organizationId !== organizationId);
  const byId = new Map(existingRecords.filter((record) => record.organizationId === organizationId)
    .map((record) => [record.id, structuredClone(record)]));
  for (const record of fetchedRecords) {
    const current = byId.get(record.id);
    if (!current) {
      byId.set(record.id, structuredClone(record));
      continue;
    }
    byId.set(record.id, {
      ...current,
      ...record,
      aliases: mergeUnique(current.aliases, record.aliases),
      listedAffiliations: mergeUnique(current.listedAffiliations, record.listedAffiliations),
      officialProfileUrl: record.officialProfileUrl || current.officialProfileUrl || null,
    });
  }
  return [...untouched, ...byId.values()].sort((a, b) =>
    a.organizationId.localeCompare(b.organizationId) || a.name.localeCompare(b.name, "en")
    || String(a.electionYear || "").localeCompare(String(b.electionYear || "")));
};

export const replaceObservedSourceSlice = (existingRecords = [], fetchedRecords = []) => {
  const observed = new Set(fetchedRecords.filter((record) => record.officialListUrl && record.sourceMode === "official-annual")
    .map((record) => `${record.organizationId}|${record.electionYear ?? "undated"}`));
  return existingRecords.filter((record) => !observed.has(
    `${record.organizationId}|${record.electionYear ?? "undated"}`));
};

export const replaceCompleteDirectorySlice = (existingRecords = [], organizationId) =>
  existingRecords.filter((record) => record.organizationId !== organizationId);

export const buildFellowIndexes = (records = []) => {
  const byName = {};
  for (const record of records) {
    for (const alias of mergeUnique(record.name, record.aliases)) {
      const key = normalizePersonName(alias);
      if (!key) continue;
      byName[key] ||= [];
      if (!byName[key].includes(record.id)) byName[key].push(record.id);
    }
  }
  return byName;
};

export const buildFellowCounts = (records = []) => {
  const byOrganization = {};
  const byGrade = {};
  for (const record of records) {
    byOrganization[record.organizationId] = (byOrganization[record.organizationId] || 0) + 1;
    const gradeKey = `${record.organizationId}:${record.membershipGrade}`;
    byGrade[gradeKey] = (byGrade[gradeKey] || 0) + 1;
  }
  return { total: records.length, byOrganization, byGrade };
};

export const buildCoverageMetrics = (records = [], source = {}) => {
  const scoped = source.organizationId
    ? records.filter((record) => record.organizationId === source.organizationId)
    : records;
  const years = [...new Set(scoped.map((record) => record.electionYear)
    .filter(Number.isInteger))].sort((a, b) => a - b);
  const affiliationCount = scoped.filter((record) => Array.isArray(record.listedAffiliations)
    && record.listedAffiliations.some((value) => String(value).trim())).length;
  return {
    recordCount: scoped.length,
    affiliationCount,
    affiliationRate: scoped.length ? affiliationCount / scoped.length : 0,
    years,
    coverageClaim: source.coverage || "unknown",
  };
};

export const validateCoverageClaim = (metrics, source = {}) => {
  const errors = [];
  const claimsComplete = /complete/.test(source.coverageKind || "");
  const minimum = Number(source.expectedMinimum || 0);
  if (claimsComplete && minimum && metrics.recordCount < minimum) {
    errors.push(`coverage:unsafe-record-count:${metrics.recordCount}<${minimum}`);
  }
  return errors;
};

export const stableRecordId = ({ organizationId, name, membershipGrade, electionYear, officialId }) =>
  `${organizationId}:${officialId || [normalizePersonName(name), normalizePersonName(membershipGrade), electionYear || "undated"].join(":")}`;
