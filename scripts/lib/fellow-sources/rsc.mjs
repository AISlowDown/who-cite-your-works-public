import { stableRecordId } from "../fellow-cache.mjs";
import { decodeHtml } from "./http.mjs";

export const parseRscOfficialProfile = (html, url, verifiedOn) => {
  const explicit = /(?:elected\s+(?:a\s+)?Fellow of the Royal Society of Chemistry|Fellow of the Royal Society of Chemistry\s*\(FRSC\)|\bCChem\s+FRSC\b)/i;
  if (!explicit.test(decodeHtml(html))) return [];
  const name = decodeHtml(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || "");
  if (!name) return [];
  const affiliation = decodeHtml(html.match(/class="(?:organisation|organization)"[^>]*>([\s\S]*?)<\//i)?.[1] || "");
  const year = Number(decodeHtml(html).match(/(?:FRSC|Chemistry)[^0-9]{0,40}(20\d{2})/i)?.[1]) || null;
  return [{ id: stableRecordId({ organizationId: "rsc", name, membershipGrade: "FRSC", electionYear: year }),
    name, aliases: [name], organizationId: "rsc", organization: "Royal Society of Chemistry",
    membershipGrade: "FRSC", membershipGradeZh: "英国皇家化学会会士", electionYear: year,
    listedAffiliations: affiliation ? [affiliation] : [], status: "current-or-elected",
    sourceMode: "official-incremental", coverage: "official-incremental", officialProfileUrl: url,
    officialListUrl: url, verifiedOn }];
};

export const parseRscCredentialPage = (html, { url, verifiedOn }) =>
  parseRscOfficialProfile(html, url, verifiedOn).map((record) => ({ ...record,
    sourceMode: "official-digital-credential", coverage: "official-public-credential-evidence" }));

export const parseRscHonoraryFellows = (html, { url, verifiedOn }) => {
  const records = [];
  for (const match of html.matchAll(/<article[^>]*>([\s\S]*?)<\/article>/gi)) {
    const block = match[1];
    const name = decodeHtml(block.match(/<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/i)?.[1] || "")
      .replace(/^(?:Professor|Prof\.?|Dame|Sir)\s+/i, "").trim();
    const affiliation = decodeHtml(block.match(/class="[^"]*affiliation[^"]*"[^>]*>([\s\S]*?)<\//i)?.[1] || "");
    if (!name) continue;
    const membershipGrade = "Honorary Fellow (HonFRSC)";
    records.push({ id: stableRecordId({ organizationId: "rsc", name, membershipGrade, electionYear: null }),
      name, aliases: [name], organizationId: "rsc", organization: "Royal Society of Chemistry",
      membershipGrade, membershipGradeZh: "英国皇家化学会荣誉会士", electionYear: null,
      listedAffiliations: affiliation ? [affiliation] : [], status: "current", sourceMode: "official-directory",
      coverage: "official-current-honorary-fellows", officialProfileUrl: null, officialListUrl: url, verifiedOn });
  }
  return records;
};

const honoraryName = (rawName) => String(rawName)
  .replace(/^(?:(?:The Rt Hon\.|HRH|Professor|Prof\.?|Dr|Sir|Dame|Mr|Ms|Miss|Lord)\s+)+/i, "")
  .replace(/\s+(?:CBE|CMG|CNZM|DBE|KCB|OBE|CSci|CChem|HonFRSC|FRS|FREng|FRSA|FRSE|FRSNZ|FLSW|FMedSci|FRCP|HonFREng|HonFRSE|ForMemRS)(?:\s+.*)?$/i, "")
  .trim();

export const parseRscHonoraryEntries = (entries, { url, verifiedOn }) => entries.map((entry) => {
  const name = honoraryName(entry.rawName);
  const membershipGrade = "Honorary Fellow (HonFRSC)";
  return { id: stableRecordId({ organizationId: "rsc", name, membershipGrade, electionYear: entry.year }),
    name, aliases: [name, entry.rawName], organizationId: "rsc", organization: "Royal Society of Chemistry",
    membershipGrade, membershipGradeZh: "英国皇家化学会荣誉会士", electionYear: entry.year,
    listedAffiliations: entry.affiliation ? [entry.affiliation] : [], status: "current",
    sourceMode: "official-directory", coverage: "official-current-honorary-fellows",
    officialProfileUrl: null, officialListUrl: url, verifiedOn };
});

export const refreshRsc = async ({ fixtureText, verifiedOn, manifestRecords = [], sourceManifest } = {}) => {
  if (fixtureText != null) return parseRscOfficialProfile(fixtureText, "https://www.rsc.org/people/cynthia-ibeto", verifiedOn);
  const honorary = sourceManifest?.entries?.length ? parseRscHonoraryEntries(sourceManifest.entries,
    { url: sourceManifest.sourceUrl, verifiedOn }) : [];
  return [...manifestRecords.filter((record) => record.organizationId === "rsc"), ...honorary];
};
