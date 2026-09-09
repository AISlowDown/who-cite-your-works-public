import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { stableRecordId } from "../fellow-cache.mjs";
import { decodeHtml, fetchOfficialBuffer, fetchOfficialText } from "./http.mjs";

const base = "https://www.acs.org/funding/awards/acs-fellows/fellows";
const workbookUrl = "https://www.acs.org/content/dam/acsorg/funding/fellows/fellows-website/acs-fellows-list.xlsx";
const makeRecord = (name, affiliation, year, verifiedOn, url = `${base}/${year}-fellows.html`) => ({
  id: stableRecordId({ organizationId: "acs", name, membershipGrade: "ACS Fellow", electionYear: year }),
  name, aliases: [name], organizationId: "acs", organization: "American Chemical Society",
  membershipGrade: "ACS Fellow", membershipGradeZh: "美国化学会会士", electionYear: Number(year) || null,
  listedAffiliations: affiliation ? [affiliation] : [], status: "elected", sourceMode: "official-annual",
  coverage: "official-annual", officialProfileUrl: null, officialListUrl: url, verifiedOn,
});

export const parseAcsAnnualHtml = (html, year, verifiedOn, url) => {
  const rows = [];
  for (const match of html.matchAll(/<tr[^>]*>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>[\s\S]*?<\/tr>/gi)) {
    const name = decodeHtml(match[1]);
    const affiliation = decodeHtml(match[2]);
    if (name && affiliation && !/^name$/i.test(name)) rows.push(makeRecord(name, affiliation, year, verifiedOn, url));
  }
  return rows;
};

const splitCsv = (line) => {
  const values = []; let current = ""; let quoted = false;
  for (const char of line) {
    if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { values.push(current.trim()); current = ""; }
    else current += char;
  }
  values.push(current.trim()); return values;
};
export const parseAcsCsv = (text, verifiedOn) => text.trim().split(/\r?\n/).slice(1).map(splitCsv)
  .filter(([name, , year]) => name && year)
  .map(([name, affiliation, year]) => makeRecord(name, affiliation, Number(year), verifiedOn));

export const parseAcsWorkbookXml = (sharedXml, sheetXml, verifiedOn, url = workbookUrl) => {
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) => decodeHtml(
    [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((part) => part[1]).join("")));
  const records = [];
  for (const rowMatch of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = {};
    for (const cell of rowMatch[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const column = cell[1].match(/\br="([A-Z]+)\d+"/)?.[1];
      const raw = cell[2].match(/<v>([\s\S]*?)<\/v>/)?.[1];
      if (!column || raw == null) continue;
      cells[column] = /\bt="s"/.test(cell[1]) ? shared[Number(raw)] : raw;
    }
    if (!cells.C || cells.C === "Full Name" || !/^20\d{2}$/.test(String(cells.D || ""))) continue;
    records.push({ ...makeRecord(cells.C, cells.E || "", Number(cells.D), verifiedOn, url),
      coverage: "official-annual-2009-present" });
  }
  return records;
};

const parseAcsWorkbookBuffer = async (buffer, verifiedOn) => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "acs-fellows-"));
  const workbookPath = path.join(tempDir, "acs-fellows.xlsx");
  try {
    await fs.writeFile(workbookPath, buffer);
    const sharedXml = execFileSync("unzip", ["-p", workbookPath, "xl/sharedStrings.xml"], { encoding: "utf8" });
    const sheetXml = execFileSync("unzip", ["-p", workbookPath, "xl/worksheets/sheet1.xml"], { encoding: "utf8" });
    return parseAcsWorkbookXml(sharedXml, sheetXml, verifiedOn, workbookUrl);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};

export const refreshAcs = async ({ verifiedOn, fixtureText, manifestRecords = [] } = {}) => {
  if (fixtureText != null) return parseAcsAnnualHtml(fixtureText, 2025, verifiedOn);
  try {
    const workbookRecords = await parseAcsWorkbookBuffer(await fetchOfficialBuffer(workbookUrl), verifiedOn);
    if (workbookRecords.length) return workbookRecords;
  } catch { /* official annual page and manifest fallback */ }
  const records = [];
  for (let year = 2020; year <= 2025; year += 1) {
    const url = `${base}/${year}-fellows.html`;
    try { records.push(...parseAcsAnnualHtml(await fetchOfficialText(url), year, verifiedOn, url)); } catch { /* retain other years */ }
  }
  return records.length ? records : manifestRecords.filter((record) => record.organizationId === "acs");
};
