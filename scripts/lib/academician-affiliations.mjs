const decode = (value = "") => String(value).replace(/&nbsp;|&ensp;|&emsp;|&#160;/gi, " ")
  .replace(/&amp;/gi, "&").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ").trim();
const normalizeName = (value = "") => decode(value).normalize("NFKC")
  .replace(/[（(]女[）)]/g, "").replace(/[·.\-_'’\s]/g, "").toLowerCase();
const uniq = (values) => [...new Set(values.filter(Boolean).map((value) => String(value).trim()))];

export const parseAcademicianElectionTable = (html, { academy, electionYear, sourceUrl }) => {
  const rows = [];
  for (const table of html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)) {
    const parsed = [...table[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
      [...row[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => decode(cell[1])));
    const compact = (value) => String(value || "").replace(/\s+/g, "");
    const header = parsed.find((cells) => cells.some((cell) => compact(cell) === "姓名")
      && cells.some((cell) => compact(cell) === "工作单位"));
    if (!header) continue;
    const nameIndex = header.findIndex((cell) => compact(cell) === "姓名");
    const affiliationIndex = header.findIndex((cell) => compact(cell) === "工作单位");
    for (const cells of parsed) {
      const name = normalizeName(cells[nameIndex]);
      const affiliation = decode(cells[affiliationIndex]);
      if (!name || name === "姓名" || !affiliation || affiliation === "工作单位") continue;
      rows.push({ name, affiliation, academy, electionYear, sourceUrl });
    }
  }
  return rows;
};

export const parseCasCandidatePublicLocationsText = (text, eligibleNames) => {
  const targets = new Map((eligibleNames || []).map((name) => [normalizeName(name), name]));
  const rows = [];
  const seen = new Set();
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  const institutionFrom = (value) => decode(value).match(/^(.{2,100}?(?:大学|学院|研究院|研究所|医院|实验室|中心|公司|集团|科学院)(?:（[^）]{1,20}）|\([^)]{1,20}\))?)(?=\s|$)/)?.[1] || "";
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const token = line.trimStart().match(/^(\S+)/)?.[1];
    const name = targets.get(normalizeName(token?.split(/\s/)[0]));
    if (!name) continue;
    let remainder = line.trim().slice(name.length).trim();
    let affiliation = institutionFrom(remainder);
    if (!affiliation && !remainder) {
      let joined = "";
      for (let offset = 1; offset <= 4 && index + offset < lines.length; offset += 1) {
        joined += lines[index + offset].trim();
        affiliation = institutionFrom(joined);
        if (affiliation) break;
      }
    }
    const key = `${normalizeName(name)}|${affiliation}`;
    if (!name || !affiliation || seen.has(key)) continue;
    seen.add(key); rows.push({ name, affiliation });
  }
  const shortestByName = new Map();
  for (const row of rows) {
    const key = normalizeName(row.name);
    const current = shortestByName.get(key);
    if (!current || row.affiliation.length < current.affiliation.length) shortestByName.set(key, row);
  }
  return [...shortestByName.values()];
};

export const applyElectionAffiliations = (cache, evidence, verifiedOn) => {
  const refreshedSources = new Set(evidence.map((item) => item.sourceUrl).filter(Boolean));
  const cleanedRecords = (cache.records || []).map((record) => {
    const priorEvidence = record.affiliationEvidence || [];
    const replaced = priorEvidence.filter((item) => refreshedSources.has(item.sourceUrl));
    const retainedEvidence = priorEvidence.filter((item) => !refreshedSources.has(item.sourceUrl));
    const replacedAffiliations = new Set(replaced.map((item) => item.affiliation));
    const independentlySupported = new Set([...(record.currentAffiliations || []),
      ...(record.currentAtSourceAffiliations || []), ...retainedEvidence.map((item) => item.affiliation)]);
    const keep = (affiliation) => !replacedAffiliations.has(affiliation) || independentlySupported.has(affiliation);
    return { ...record, listedAffiliations: (record.listedAffiliations || []).filter(keep),
      careerAffiliations: (record.careerAffiliations || []).filter(keep), affiliationEvidence: retainedEvidence };
  });
  const candidates = new Map();
  const candidatesByYear = new Map();
  for (const [index, record] of cleanedRecords.entries()) {
    const key = `${record.academy}|${normalizeName(record.name)}`;
    const indexes = candidates.get(key) || [];
    indexes.push(index); candidates.set(key, indexes);
    if (record.electionYear) {
      const yearKey = `${key}|${record.electionYear}`;
      const yearIndexes = candidatesByYear.get(yearKey) || [];
      yearIndexes.push(index); candidatesByYear.set(yearKey, yearIndexes);
    }
  }
  const byIndex = new Map();
  let ambiguous = 0;
  for (const item of evidence) {
    const key = `${item.academy}|${normalizeName(item.name)}`;
    const exact = item.electionYear ? candidatesByYear.get(`${key}|${item.electionYear}`) || [] : [];
    const indexes = exact.length ? exact : candidates.get(key) || [];
    if (indexes.length !== 1) { if (indexes.length > 1) ambiguous += 1; continue; }
    const values = byIndex.get(indexes[0]) || [];
    values.push(item); byIndex.set(indexes[0], values);
  }
  const records = cleanedRecords.map((record, index) => {
    const matches = byIndex.get(index) || [];
    if (!matches.length) return record;
    const affiliations = matches.map((item) => item.affiliation);
    const currentAffiliations = matches.filter((item) => item.evidenceType === "official-current-profile")
      .map((item) => item.affiliation);
    const affiliationEvidence = uniq([...(record.affiliationEvidence || []).map((item) => JSON.stringify(item)),
      ...matches.map((item) => JSON.stringify({ affiliation: item.affiliation, electionYear: item.electionYear,
        evidenceType: item.evidenceType || "work-unit-at-election", sourceUrl: item.sourceUrl,
        verifiedOn }))]).map((value) => JSON.parse(value));
    return { ...record,
      listedAffiliations: uniq([...(record.listedAffiliations || []), ...affiliations]),
      currentAffiliations: uniq([...(record.currentAffiliations || []), ...currentAffiliations]),
      careerAffiliations: uniq([...(record.careerAffiliations || []), ...affiliations]), affiliationEvidence };
  });
  const affiliationCount = records.filter((record) => record.listedAffiliations?.length).length;
  return { ...cache, verifiedOn, records, affiliationEnrichment: { verifiedOn, evidenceRows: evidence.length,
    matchedRecords: byIndex.size, ambiguousRows: ambiguous, affiliationCount,
    affiliationRate: records.length ? affiliationCount / records.length : 0 } };
};
