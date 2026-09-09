import { stableRecordId } from "../fellow-cache.mjs";
import { decodeHtml } from "./http.mjs";

export const parseAaasAnnualHtml = (html, year, verifiedOn, url) => {
  const records = [];
  for (const match of html.matchAll(/<tr[^>]*>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi)) {
    const [name, affiliation, grade] = [decodeHtml(match[1]), decodeHtml(match[2]), decodeHtml(match[3])];
    if (grade !== "AAAS Fellow") continue;
    records.push({ id: stableRecordId({ organizationId: "aaas", name, membershipGrade: grade, electionYear: year }),
      name, aliases: [name], organizationId: "aaas", organization: "American Association for the Advancement of Science",
      membershipGrade: grade, membershipGradeZh: "美国科学促进会会士", electionYear: year,
      listedAffiliations: affiliation ? [affiliation] : [], status: "elected", sourceMode: "official-annual",
      coverage: "official-current-or-annual", officialProfileUrl: null, officialListUrl: url, verifiedOn });
  }
  return records;
};

const affiliationStart = /(?:\bU\.S\.|\bInc\.|\b(?:University|College|Institute|Laborator(?:y|ies)|United States|National|Federal|Department|School|Academy|Center|Centre|Corporation|Company|LLC|CSIRO|NASA|NOAA|NIH|Smithsonian)\b|\bResources for the Future\b)/;

const cleanProgramParagraph = (paragraph) => paragraph
  .replace(/-\s*\n\s*/g, "-")
  .replace(/\s*\n\s*/g, " ")
  .replace(/[ \t]+/g, " ")
  .trim();

export const parseAaasProgramText = (text, { year, url, verifiedOn }) => {
  const records = [];
  let section = null;
  for (const raw of String(text).replace(/\r/g, "").split(/\n\s*\n+/)) {
    const paragraph = cleanProgramParagraph(raw);
    if (!paragraph || /AAAS Fellows\s*\|/i.test(paragraph)) continue;
    if (!/:\s*For\b/i.test(paragraph)) {
      if (/^[A-Z][A-Z, &-]+$/.test(paragraph)) section = paragraph;
      continue;
    }
    const citationAt = paragraph.search(/:\s*For\b/i);
    const identity = paragraph.slice(0, citationAt).trim();
    const citation = paragraph.slice(citationAt + 1).trim();
    const boundary = identity.search(affiliationStart);
    if (boundary <= 0) continue;
    const name = identity.slice(0, boundary).trim();
    const affiliation = identity.slice(boundary).trim();
    if (!/^[A-Z][\p{L}.'\- ]+$/u.test(name) || name.split(/\s+/).length < 2) continue;
    const membershipGrade = "AAAS Fellow";
    records.push({
      id: stableRecordId({ organizationId: "aaas", name, membershipGrade, electionYear: year }),
      name, aliases: [name], organizationId: "aaas",
      organization: "American Association for the Advancement of Science",
      membershipGrade, membershipGradeZh: "美国科学促进会会士", electionYear: year,
      listedAffiliations: affiliation ? [affiliation] : [], status: "elected",
      sourceMode: "official-annual", coverage: "official-annual-public-programs",
      officialProfileUrl: null, officialListUrl: url, verifiedOn, section, citation,
      extractionLocator: `${year} AAAS Fellows program${section ? ` - ${section}` : ""}`,
    });
  }
  return records;
};

export const refreshAaas = async ({ verifiedOn, fixtureText, manifestRecords = [] } = {}) => {
  if (fixtureText != null) return parseAaasAnnualHtml(fixtureText, 2024, verifiedOn, "https://www.aaas.org/fellows/2024");
  return manifestRecords.filter((record) => record.organizationId === "aaas");
};
