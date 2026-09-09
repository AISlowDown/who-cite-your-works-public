import { stableRecordId } from "../fellow-cache.mjs";
import { decodeHtml, fetchOfficialText } from "./http.mjs";

const annualUrl = "https://www.iwa-network.org/news/iwa-announces-2024-fellows-and-distinguished-fellows/";
const record = (name, affiliation, grade, year, verifiedOn, url = annualUrl) => ({
  id: stableRecordId({ organizationId: "iwa", name, membershipGrade: grade, electionYear: year }),
  name, aliases: [name], organizationId: "iwa", organization: "International Water Association",
  membershipGrade: grade, membershipGradeZh: grade === "IWA Distinguished Fellow" ? "国际水协会杰出会士" : "国际水协会会士",
  electionYear: year, listedAffiliations: affiliation ? [affiliation] : [], status: "elected",
  sourceMode: "official-annual", coverage: "official-incremental", officialProfileUrl: null,
  officialListUrl: url, verifiedOn,
});

const tableRows = (segment) => [...segment.matchAll(/<tr[^>]*>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>(?:[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>)?[\s\S]*?<\/tr>/gi)]
  .map((match) => [decodeHtml(match[1]), decodeHtml(match[2]), decodeHtml(match[3] || "")])
  .filter(([name]) => name && !/^name$/i.test(name));

export const parseIwaAnnualHtml = (html, year, verifiedOn, url = annualUrl) => {
  const rows = [];
  const headings = [...html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/gi)];
  for (let index = 0; index < headings.length; index += 1) {
    const title = decodeHtml(headings[index][1]);
    const grade = /IWA Distinguished Fellows/i.test(title) ? "IWA Distinguished Fellow"
      : /IWA Fellows/i.test(title) ? "IWA Fellow" : null;
    if (!grade) continue;
    const start = headings[index].index + headings[index][0].length;
    const end = headings[index + 1]?.index || html.length;
    for (const [name, affiliation] of tableRows(html.slice(start, end))) {
      rows.push(record(name, affiliation, grade, year, verifiedOn, url));
    }
  }
  return rows;
};

export const refreshIwa = async ({ verifiedOn, fixtureText } = {}) =>
  parseIwaAnnualHtml(fixtureText ?? await fetchOfficialText(annualUrl), 2024, verifiedOn, annualUrl);
