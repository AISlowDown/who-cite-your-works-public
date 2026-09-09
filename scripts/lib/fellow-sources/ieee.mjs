import { stableRecordId } from "../fellow-cache.mjs";
import { decodeHtml } from "./http.mjs";

const makeRecord = ({ name, affiliation = "", year = null, citation = null, profileUrl = null,
  sourceMode, url, verifiedOn, directoryVisibility = null }) => ({
  id: stableRecordId({ organizationId: "ieee", name, membershipGrade: "IEEE Fellow", electionYear: year }),
  name, aliases: [name], organizationId: "ieee", organization: "IEEE", membershipGrade: "IEEE Fellow",
  membershipGradeZh: "IEEE Fellow", electionYear: year, listedAffiliations: affiliation ? [affiliation] : [],
  status: "elected", sourceMode, coverage: "official-public-directory-or-annual",
  officialProfileUrl: profileUrl, officialListUrl: url, verifiedOn,
  ...(citation ? { citation } : {}), ...(directoryVisibility ? { directoryVisibility } : {}),
});

export const parseIeeeAnnualHtml = (html, year, verifiedOn, url) => {
  const records = [];
  for (const match of html.matchAll(/<tr[^>]*>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi)) {
    const [name, affiliation, grade] = [decodeHtml(match[1]), decodeHtml(match[2]), decodeHtml(match[3])];
    if (grade !== "IEEE Fellow") continue;
    records.push({ id: stableRecordId({ organizationId: "ieee", name, membershipGrade: grade, electionYear: year }),
      name, aliases: [name], organizationId: "ieee", organization: "IEEE", membershipGrade: grade,
      membershipGradeZh: "IEEE Fellow", electionYear: year, listedAffiliations: affiliation ? [affiliation] : [],
      status: "elected", sourceMode: "official-annual", coverage: "official-public-directory-or-annual",
      officialProfileUrl: null, officialListUrl: url, verifiedOn });
  }
  return records;
};

export const parseIeeeDirectoryPayload = (payload, { url, verifiedOn }) => {
  const rows = Array.isArray(payload) ? payload : (payload?.results || payload?.items || payload?.data || []);
  return rows.flatMap((item) => {
    const name = item.preferredName || item.name || item.fullName;
    if (!name) return [];
    return [makeRecord({ name, affiliation: item.affiliation || item.organization || "",
      year: Number(item.elevationYear || item.year) || null, citation: item.citation || null,
      profileUrl: item.profileUrl || null, sourceMode: "official-public-directory", url, verifiedOn,
      directoryVisibility: "public-opt-in" })];
  });
};

export const parseIeeeAnnualText = (text, { year, url, verifiedOn }) => String(text).split(/\r?\n/)
  .map((line) => line.trim()).filter(Boolean).flatMap((line) => {
    const [name, affiliation = "", citation = ""] = line.split(/\s*\|\s*/);
    if (!name || !affiliation) return [];
    return [makeRecord({ name, affiliation, year, citation: citation || null,
      sourceMode: "official-annual", url, verifiedOn })];
  });
export const refreshIeee = async ({ verifiedOn, fixtureText, manifestRecords = [] } = {}) => {
  if (fixtureText != null) return parseIeeeAnnualHtml(fixtureText, 2025, verifiedOn, "https://cn.ieee.org/fellows-2025");
  return manifestRecords.filter((record) => record.organizationId === "ieee");
};
