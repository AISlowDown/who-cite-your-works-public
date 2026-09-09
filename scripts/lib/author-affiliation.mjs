const clean = (values) => [...new Set((values || []).map((value) => String(value).trim()).filter(Boolean))];

export const resolveCitingArticleAffiliations = (author = {}) => {
  const articleAffiliations = clean(author.articleAffiliations);
  if (articleAffiliations.length) {
    return {
      affiliations: articleAffiliations,
      sourceType: author.affiliationEvidence?.sourceType || "publisher_article",
      sourceUrl: author.affiliationEvidence?.sourceUrl || "",
      rawText: author.affiliationEvidence?.rawText || "",
    };
  }

  return {
    affiliations: clean(author.paperAffiliations),
    sourceType: author.affiliationEvidence?.sourceType || "openalex_authorship_fallback",
    sourceUrl: author.affiliationEvidence?.sourceUrl || author.openalexId || "",
    rawText: author.affiliationEvidence?.rawText || "",
  };
};
