export const isStrictPriorityInstitution = (institution = {}) => {
  const classifications = institution.classifications || [];
  if (classifications.includes("985") || classifications.includes("211") || classifications.includes("双一流")) return true;

  if (institution.qsRank == null) return false;
  const rank = Number(String(institution.qsRank).match(/\d+/)?.[0]);
  return Number.isFinite(rank) && rank > 0 && rank <= 200;
};

export const hasStrictPriorityAffiliation = (author = {}, cache = {}) =>
  resolveCitingArticleAffiliations(author).affiliations.some((name) =>
    isStrictPriorityInstitution(cache.institutions?.[name]),
  );
import { resolveCitingArticleAffiliations } from "./author-affiliation.mjs";
