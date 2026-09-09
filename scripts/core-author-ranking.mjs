import { resolveCitingArticleAffiliations } from "./lib/author-affiliation.mjs";

export function selectCoreAuthors(records, { threshold = 2000, limit = 100, includeAuthor = () => true } = {}) {
  const authors = new Map();

  for (const record of records) {
    for (const author of record.noteworthyAuthors || []) {
      const isCoreRole = author.position === 1 || author.corresponding === true;
      if (!isCoreRole || (author.citedByCount || 0) <= threshold || !includeAuthor(author)) continue;

      const key = author.openalexId || author.name;
      const profile = authors.get(key) || {
        name: author.name,
        openalexId: author.openalexId || "",
        citedByCount: 0,
        hIndex: 0,
        scenarioCount: 0,
        firstAuthorScenarios: 0,
        correspondingAuthorScenarios: 0,
        existingCoauthor: false,
        paperAffiliations: new Set(),
        affiliationEvidenceSources: new Set(),
        affiliationEvidenceUrls: new Set(),
        userPapers: new Set(),
        citingPapers: new Set(),
      };

      profile.citedByCount = Math.max(profile.citedByCount, author.citedByCount || 0);
      profile.hIndex = Math.max(profile.hIndex, author.hIndex || 0);
      profile.scenarioCount += 1;
      if (author.position === 1) profile.firstAuthorScenarios += 1;
      if (author.corresponding === true) profile.correspondingAuthorScenarios += 1;
      profile.existingCoauthor ||= author.existingCoauthor === true;
      const affiliationEvidence = resolveCitingArticleAffiliations(author);
      for (const affiliation of affiliationEvidence.affiliations) profile.paperAffiliations.add(affiliation);
      profile.affiliationEvidenceSources.add(affiliationEvidence.sourceType);
      if (affiliationEvidence.sourceUrl) profile.affiliationEvidenceUrls.add(affiliationEvidence.sourceUrl);
      if (record.userWork?.title) profile.userPapers.add(record.userWork.title);
      if (record.citingWork?.title) profile.citingPapers.add(record.citingWork.title);
      authors.set(key, profile);
    }
  }

  return [...authors.values()]
    .sort((a, b) => b.citedByCount - a.citedByCount || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((author, index) => ({
      ...author,
      rank: index + 1,
      paperAffiliations: [...author.paperAffiliations].sort(),
      affiliationEvidenceSources: [...author.affiliationEvidenceSources].sort(),
      affiliationEvidenceUrls: [...author.affiliationEvidenceUrls].sort(),
      userPapers: [...author.userPapers].sort(),
      citingPapers: [...author.citingPapers].sort(),
    }));
}
