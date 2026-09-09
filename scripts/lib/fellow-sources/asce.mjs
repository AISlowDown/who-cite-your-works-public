import { stableRecordId } from "../fellow-cache.mjs";
import { decodeHtml, fetchOfficialText } from "./http.mjs";

const registerUrl = "https://www.asce.org/about-asce/official-register";
const accepted = new Set(["ASCE Fellow", "ASCE Distinguished Member"]);
export const parseAsceHtml = (html, year, verifiedOn, url = registerUrl) => {
  const rows = [];
  for (const match of html.matchAll(/<tr[^>]*>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi)) {
    const [name, grade, affiliation] = [decodeHtml(match[1]), decodeHtml(match[2]), decodeHtml(match[3])];
    if (!accepted.has(grade)) continue;
    rows.push({ id: stableRecordId({ organizationId: "asce", name, membershipGrade: grade, electionYear: year }),
      name, aliases: [name], organizationId: "asce", organization: "American Society of Civil Engineers",
      membershipGrade: grade, membershipGradeZh: grade === "ASCE Fellow" ? "美国土木工程师学会会士" : "美国土木工程师学会杰出会员",
      electionYear: year || null, listedAffiliations: affiliation ? [affiliation] : [], status: "current-or-elected",
      sourceMode: "official-incremental", coverage: "official-incremental-or-annual", officialProfileUrl: null,
      officialListUrl: url, verifiedOn });
  }
  return rows;
};

export const parseAsceOfficialRegisterText = (text, { year, url, verifiedOn }) => {
  const count = String(text).match(/\bFellows\s+([\d,]+)/i)?.[1];
  return { organizationId: "asce", year, fellowCount: count ? Number(count.replace(/,/g, "")) : null,
    sourceUrl: url, verifiedOn, evidenceType: "aggregate-only" };
};

export const parseAsceElevationArticle = (html, { year, url, verifiedOn }) => {
  const text = decodeHtml(html);
  if (!/(?:elevated to|named a) ASCE Fellow|named a Fellow by ASCE/i.test(text)) return [];
  const heading = decodeHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
  let name = heading.match(/^(.+?)\s+elevated to ASCE Fellow/i)?.[1]?.trim();
  if (name && name.split(/\s+/).length === 1) {
    name = text.match(/\b([A-Z][\p{L}.'-]+\s+[A-Z][\p{L}.'-]+),\s+(?:professor|engineer|president|director)/u)?.[1] || name;
  }
  if (!name) name = text.match(/\b([A-Z][\p{L}.'-]+\s+[A-Z][\p{L}.'-]+),\s+(?:professor|engineer|president|director)/u)?.[1];
  if (!name) return [];
  const affiliation = text.match(/(?:professor at|engineer at|president of|director at)\s+([^,.]+(?:University|Institute|Laboratory|Company|Corporation)?)/i)?.[1]?.trim() || "";
  return [{ id: stableRecordId({ organizationId: "asce", name, membershipGrade: "ASCE Fellow", electionYear: year }),
    name, aliases: [name], organizationId: "asce", organization: "American Society of Civil Engineers",
    membershipGrade: "ASCE Fellow", membershipGradeZh: "美国土木工程师学会会士", electionYear: year,
    listedAffiliations: affiliation ? [affiliation] : [], status: "elected", sourceMode: "official-incremental",
    coverage: "official-incremental-or-annual", officialProfileUrl: url, officialListUrl: url, verifiedOn }];
};
export const refreshAsce = async ({ verifiedOn, fixtureText, manifestRecords = [] } = {}) => {
  if (fixtureText != null) return parseAsceHtml(fixtureText, null, verifiedOn, registerUrl);
  let parsed = [];
  try { parsed = parseAsceHtml(await fetchOfficialText(registerUrl), null, verifiedOn, registerUrl); } catch { /* official manifest fallback */ }
  return parsed.length ? parsed : manifestRecords.filter((record) => record.organizationId === "asce");
};
