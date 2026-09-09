import { normalizePersonName } from "../fellow-cache.mjs";
import { decodeHtml, fetchOfficialText } from "./http.mjs";

const listUrl = "https://royalsociety.org/fellows-directory/";
const endpoint = "https://royalsociety.org/api/sitecore/FellowsDirectory/PostFellowsDirectoryDisplay";
export const grades = ["Fellow", "Foreign Member", "Honorary Fellow", "Royal Fellow", "Statute 12"];
const gradeZh = { Fellow: "英国皇家学会会士", "Foreign Member": "英国皇家学会外籍会士",
  "Honorary Fellow": "英国皇家学会荣誉会士", "Royal Fellow": "英国皇家学会王室会士",
  "Statute 12": "英国皇家学会 Statute 12 会士" };
const stripHonorific = (name) => String(name)
  .replace(/^(?:Professor|Prof\.?|Doctor|Dr\.?|Sir|Dame|Lord|Lady|HRH|Prince|Princess)\s+/i, "").trim();

export const parseRoyalSocietyPage = (html, grade, verifiedOn) => {
  const records = [];
  const pattern = /<article\s+class="card card--person">[\s\S]*?<a\s+class="card__link"\s+href="([^"]+)"[\s\S]*?<h4\s+class="card__title">\s*([^<]+)<\/h4>[\s\S]*?<\/article>/g;
  for (const match of html.matchAll(pattern)) {
    const officialProfileUrl = new URL(match[1], listUrl).href;
    const name = decodeHtml(match[2]);
    const profileId = officialProfileUrl.match(/-(\d+)\/?$/)?.[1] || normalizePersonName(name);
    records.push({ id: `royal-society:${profileId}`, name,
      aliases: [...new Set([name, stripHonorific(name)].filter(Boolean))], organizationId: "royal-society",
      organization: "Royal Society", membershipGrade: grade, membershipGradeZh: gradeZh[grade],
      electionYear: null, listedAffiliations: [], status: "current-public-directory",
      sourceMode: "official-directory", coverage: "official-current-directory", officialProfileUrl,
      officialListUrl: listUrl, verifiedOn });
  }
  return records;
};

const maxPage = (html) => Math.max(1, ...[...html.matchAll(/data-name="page"\s+data-value="(\d+)"/g)]
  .map((match) => Number(match[1])).filter(Number.isFinite));
const fetchPage = async (grade, page) => {
  const body = new URLSearchParams({ type: grade });
  if (page > 1) body.set("page", String(page));
  return fetchOfficialText(endpoint, { method: "POST", body,
    headers: { "content-type": "application/x-www-form-urlencoded;charset=UTF-8", referer: listUrl,
      "x-requested-with": "XMLHttpRequest" } });
};

export const refreshRoyalSociety = async ({ verifiedOn, fixtureText } = {}) => {
  if (fixtureText != null) return parseRoyalSocietyPage(fixtureText, "Fellow", verifiedOn);
  const records = [];
  for (const grade of grades) {
    const first = await fetchPage(grade, 1);
    records.push(...parseRoyalSocietyPage(first, grade, verifiedOn));
    for (let page = 2; page <= maxPage(first); page += 1) {
      records.push(...parseRoyalSocietyPage(await fetchPage(grade, page), grade, verifiedOn));
    }
  }
  return records;
};
