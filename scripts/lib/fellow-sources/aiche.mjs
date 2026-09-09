import { stableRecordId } from "../fellow-cache.mjs";
import { decodeHtml } from "./http.mjs";

const historicalUrl = "https://www.aiche.org/sites/default/files/docs/pages/fellows_list_01_09_18.pdf";
const makeRecord = (name, affiliation, year, verifiedOn, sourceMode, url) => ({
  id: stableRecordId({ organizationId: "aiche", name, membershipGrade: "AIChE Fellow", electionYear: year }),
  name, aliases: [name], organizationId: "aiche", organization: "American Institute of Chemical Engineers",
  membershipGrade: "AIChE Fellow", membershipGradeZh: "美国化学工程师学会会士", electionYear: year,
  listedAffiliations: affiliation ? [affiliation] : [], status: "current-or-elected", sourceMode,
  coverage: "official-historical-through-2018-plus-incremental", officialProfileUrl: null,
  officialListUrl: url, verifiedOn,
});

export const parseAicheHistoricalText = (text, verifiedOn) => text.split(/\r?\n/).map((line) => line
  .replace(/^\s*[•*-]\s*/, "").trim()).filter((line) => /^[A-Z][\p{L}.'’ -]+$/u.test(line)
    && !/^(?:Full List of Fellows|As of)$/i.test(line) && line.split(/\s+/).length >= 2)
  .map((name) => makeRecord(name, "", null, verifiedOn, "official-historical", historicalUrl));

export const parseAicheAnnualHtml = (html, verifiedOn, url = "https://www.aiche.org/community/sites/fellows") => {
  const records = [];
  for (const match of html.matchAll(/<tr[^>]*>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>(\d{4})<\/td>[\s\S]*?<\/tr>/gi)) {
    records.push(makeRecord(decodeHtml(match[1]), decodeHtml(match[2]), Number(match[3]), verifiedOn,
      "official-annual", url));
  }
  return records;
};

export const parseAicheRecognitionPage = (html, { year, url, verifiedOn }) => {
  const records = [];
  for (const match of html.matchAll(/<article[^>]*class="[^"]*fellow[^"]*"[^>]*>([\s\S]*?)<\/article>/gi)) {
    const block = match[1];
    if (!/\bFellow\b/i.test(decodeHtml(block))) continue;
    const name = decodeHtml(block.match(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/i)?.[1] || "");
    const affiliation = decodeHtml(block.match(/class="[^"]*affiliation[^"]*"[^>]*>([\s\S]*?)<\//i)?.[1] || "");
    if (name) records.push(makeRecord(name, affiliation, year, verifiedOn, "official-annual", url));
  }
  return records;
};

export const refreshAiche = async ({ verifiedOn, fixtureText, manifestRecords = [] } = {}) => {
  if (fixtureText != null) {
    return /<tr/i.test(fixtureText) ? parseAicheAnnualHtml(fixtureText, verifiedOn)
      : parseAicheHistoricalText(fixtureText, verifiedOn);
  }
  return manifestRecords.filter((record) => record.organizationId === "aiche");
};
