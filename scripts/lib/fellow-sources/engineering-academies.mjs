import { normalizePersonName } from "../fellow-cache.mjs";
import { decodeHtml, fetchOfficialText } from "./http.mjs";
import https from "node:https";

const CAE_BASE = "https://widgets.cae-acg.ca";
const CAE_LIST = "https://cae-acg.ca/fellows/directory-of-fellows/";
const ATSE_LIST = "https://atse.org.au/who-we-are/our-fellows/all-fellows/";
const RAENG_LIST = "https://raeng.org.uk/fellows-directory/";
const RAENG_ENDPOINT = "https://raeng.org.uk/umbraco/surface/memberdirectory/SearchForm";
const NAE_LIST = "https://www.nae.edu/20412/MemberDirectory";

const uniq = (values) => [...new Set(values.map((value) => decodeHtml(value)).filter(Boolean))];
const stripPersonTitles = (name) => decodeHtml(name)
  .replace(/^(?:(?:Emeritus\s+)?Professor|Prof\.?|Doctor|Dr\.?|Dame|Sir|Mr\.?|Mrs\.?|Ms\.?|Lord|Lady|Air Chief Marshal)\s+/i, "")
  .replace(/\s+(?:HonFREng|FREng|HonFRS|FRS|FRSE|FMedSci|CBE|OBE|MBE|Kt)\b.*$/i, "").replace(/\s+/g, " ").trim();
const reverseDirectoryName = (name) => {
  const clean = decodeHtml(name);
  const [last, ...rest] = clean.split(",");
  return rest.length ? `${rest.join(",").trim()} ${last.trim()}` : clean;
};
const record = ({ id, name, organizationId, organization, membershipGrade, membershipGradeZh,
  electionYear = null, listedAffiliations = [], officialProfileUrl, officialListUrl, verifiedOn,
  sourceMode = "official-directory", coverage = "official-current-directory",
  employmentStatus = "not-explicitly-retired", retirementEvidence = null, currentTitle = null,
  research = [] }) => ({
  id: `${organizationId}:${id || normalizePersonName(name)}`, name,
  aliases: uniq([name, stripPersonTitles(name)]), organizationId, organization, membershipGrade,
  membershipGradeZh, electionYear, listedAffiliations: uniq(listedAffiliations),
  status: "current-public-directory", employmentStatus, retirementEvidence, currentTitle,
  research: uniq(research),
  sourceMode, coverage, officialProfileUrl, officialListUrl, verifiedOn,
});
const chunks = (html, startPattern) => {
  const starts = [...html.matchAll(startPattern)].map((match) => match.index);
  return starts.map((start, index) => html.slice(start, starts[index + 1] ?? html.length));
};

export const parseCanadianAcademyDirectoryPage = (html, verifiedOn) => chunks(html, /<input[^>]+hfListingID[^>]+value="[^"]+"[^>]*>/g)
  .map((block) => {
    const id = block.match(/hfListingID[^>]+value="([^"]+)"/)?.[1];
    const link = block.match(/<a[^>]+hlListing[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    const grade = decodeHtml(block.match(/Fellowship Type:[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i)?.[1]);
    if (!id || !link || !grade) return null;
    const name = reverseDirectoryName(link[2]);
    const employer = decodeHtml(block.match(/<p class="employer">([\s\S]*?)<\/p>/i)?.[1]);
    const affiliation = employer.includes(",") ? employer.slice(employer.indexOf(",") + 1).trim() : employer;
    const currentTitle = employer.includes(",") ? employer.slice(0, employer.indexOf(",")).trim() : null;
    const membershipGradeZh = /International/i.test(grade) ? "加拿大工程院外籍院士"
      : /Honorary/i.test(grade) ? "加拿大工程院荣誉院士"
        : /Emeritus/i.test(grade) ? "加拿大工程院荣休院士"
          : /90\+/i.test(grade) ? "加拿大工程院90岁以上院士" : "加拿大工程院院士";
    return record({ id, name, organizationId: "cae-canada", organization: "Canadian Academy of Engineering",
      membershipGrade: grade, membershipGradeZh,
      listedAffiliations: affiliation ? [affiliation] : [], officialProfileUrl: new URL(link[1], CAE_BASE).href,
      officialListUrl: CAE_LIST, verifiedOn, currentTitle,
      employmentStatus: /Emeritus/i.test(grade) ? "retired" : "not-explicitly-retired",
      retirementEvidence: /Emeritus/i.test(grade) ? `official membership grade: ${grade}` : null });
  }).filter(Boolean);

export const parseAtseDirectoryPage = (html, verifiedOn) => {
  const total = Number((html.match(/([\d,]+)\s+Results/i)?.[1] || "0").replaceAll(",", ""));
  const records = chunks(html, /<a[^>]+class="[^"]*reu-m13-fellow-tile[^>]*>/g).map((block) => {
    const open = block.match(/^<a[^>]+href="([^"]+)"/);
    const name = decodeHtml(block.match(/class="fellow-name"[^>]*>([\s\S]*?)<\/h4>/i)?.[1]);
    const postnominal = decodeHtml(block.match(/class="fellow-postnominal"[^>]*>([\s\S]*?)<\/span>/i)?.[1]);
    const affiliation = decodeHtml(block.match(/class="fellow-affiliation"[^>]*>([\s\S]*?)<\/span>/i)?.[1]);
    const title = decodeHtml(block.match(/class="card-body[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>[\s\S]*?class="fellow-name"/i)?.[1]);
    if (!open || !name) return null;
    const explicitFtse = /\bFTSE\b/.test(postnominal);
    return record({ id: open[1].split("/").filter(Boolean).at(-1), name, organizationId: "atse",
      organization: "Australian Academy of Technological Sciences and Engineering",
      membershipGrade: explicitFtse ? "Fellow (FTSE)" : "Fellow (official directory; postnominal omitted)",
      membershipGradeZh: "澳大利亚技术科学与工程院院士",
      listedAffiliations: affiliation ? [affiliation] : [], officialProfileUrl: new URL(open[1], ATSE_LIST).href,
      officialListUrl: ATSE_LIST, verifiedOn, currentTitle: title || null,
      employmentStatus: /\b(?:em\.?\s*professor|emeritus|retired)\b/i.test(title) ? "retired" : "not-explicitly-retired",
      retirementEvidence: /\b(?:em\.?\s*professor|emeritus|retired)\b/i.test(title)
        ? `official directory title: ${title}` : null });
  }).filter(Boolean);
  return { total, records };
};

const raengGrade = (rawName) => /\bHonFREng\b/.test(rawName) ? ["Honorary Fellow (HonFREng)", "英国皇家工程院荣誉院士"]
  : /\bFREng\b/.test(rawName) ? ["Fellow (FREng)", "英国皇家工程院院士"] : [null, null];
const raengTitle = (rawName) => decodeHtml(rawName).match(/^(Emeritus\s+Professor|Professor|Prof\.?|Doctor|Dr\.?|Dame|Sir|Lord|Lady)\b/i)?.[1] || null;
export const parseRaengDirectoryPage = (html, verifiedOn) => {
  const total = Number((html.match(/of\s+([\d,]+)\s+Fellows/i)?.[1] || "0").replaceAll(",", ""));
  const records = chunks(html, /<(?:article|div)[^>]+class="[^"]*(?:member-card|card)(?:\s|\")/g).map((block) => {
    const rawName = decodeHtml(block.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1]);
    const [membershipGrade, membershipGradeZh] = raengGrade(rawName);
    if (!rawName || !membershipGrade) return null;
    const name = stripPersonTitles(rawName);
    const year = Number(block.match(/title="Elected in\s+(\d{4})"/i)?.[1] || block.match(/class="year"[^>]*>\s*(\d{4})/i)?.[1]);
    const company = decodeHtml(block.match(/class="(?:company|organisation|organization)"[^>]*>([\s\S]*?)<\//i)?.[1]);
    const currentTitle = raengTitle(rawName);
    const research = [...block.matchAll(/class="fellow-expertise-list__tag(?:\s+d-none)?"[^>]*>([\s\S]*?)<\/span>/gi)]
      .map((match) => decodeHtml(match[1]));
    const href = block.match(/<a[^>]+href="([^"]*fellows-directory[^"]*)"/i)?.[1];
    return record({ id: `${normalizePersonName(name)}-${year || "unknown"}`, name, organizationId: "raeng",
      organization: "Royal Academy of Engineering", membershipGrade, membershipGradeZh,
      electionYear: Number.isInteger(year) && year > 1900 ? year : null,
      listedAffiliations: company ? [company] : [], officialProfileUrl: href ? new URL(href, RAENG_LIST).href : RAENG_LIST,
      officialListUrl: RAENG_LIST, verifiedOn, currentTitle, research,
      employmentStatus: /^(?:Emeritus\s+Professor|Retired\b)/i.test(rawName) ? "retired" : "not-explicitly-retired",
      retirementEvidence: /^(?:Emeritus\s+Professor|Retired\b)/i.test(rawName)
        ? `official directory title: ${rawName}` : null });
  }).filter(Boolean);
  return { total, records };
};

export const parseNaeDirectoryPage = (html, verifiedOn) => {
  const total = Number((html.match(/Items\s+\d+\s+to\s+\d+\s+from\s+([\d,]+)/i)?.[1]
    || html.match(/of\s+([\d,]+)\s+members/i)?.[1] || html.match(/([\d,]+)\s+members/i)?.[1]
    || "0").replaceAll(",", ""));
  const records = chunks(html, /<article[^>]+class="tplPerson"[^>]+data-objectid="[^"]+"[^>]*>/g).map((block) => {
    const id = block.match(/data-objectid="([^"]+)"/)?.[1];
    const grade = decodeHtml(block.match(/class="[^"]*memberType[^"]*"[^>]*>([\s\S]*?)<\/span>/i)?.[1]);
    const link = block.match(/class="name"[\s\S]*?<a href="([^"]+)">([\s\S]*?)<\/a>/i)
      || block.match(/<h3[^>]*>\s*<a href="([^"]+)">([\s\S]*?)<\/a>/i);
    if (!id || !link || !["Member", "International Member", "Emeritus"].includes(grade)) return null;
    const name = stripPersonTitles(link[2]);
    const affiliation = decodeHtml(block.match(/class="organization"[^>]*>([\s\S]*?)<\/div>/i)?.[1]);
    const jobTitle = decodeHtml(block.match(/class="jobTitle"[^>]*>([\s\S]*?)<\/div>/i)?.[1]);
    const year = Number(block.match(/Election Year[\s\S]{0,180}?class="value"[^>]*>\s*(\d{4})/i)?.[1]
      || block.match(/Election Year:\s*(\d{4})/i)?.[1]);
    return record({ id, name, organizationId: "us-nae", organization: "National Academy of Engineering",
      membershipGrade: grade, membershipGradeZh: grade === "International Member" ? "美国国家工程院外籍院士"
        : grade === "Emeritus" ? "美国国家工程院荣休院士" : "美国国家工程院院士",
      electionYear: Number.isInteger(year) && year > 1900 ? year : null,
      listedAffiliations: affiliation ? [affiliation] : [], officialProfileUrl: new URL(link[1], NAE_LIST).href,
      officialListUrl: NAE_LIST, verifiedOn,
      currentTitle: jobTitle || null,
      employmentStatus: grade === "Emeritus" || /\b(?:emeritus|retired)\b/i.test(jobTitle)
        ? "retired" : "not-explicitly-retired",
      retirementEvidence: grade === "Emeritus" ? "official membership grade: Emeritus"
        : /\b(?:emeritus|retired)\b/i.test(jobTitle) ? `official directory title: ${jobTitle}` : null });
  }).filter(Boolean);
  return { total, records };
};

export const refreshCanadianAcademyEngineering = async ({ verifiedOn, fixtureText } = {}) => {
  if (fixtureText != null) return parseCanadianAcademyDirectoryPage(fixtureText, verifiedOn);
  const pages = await Promise.all("ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => fetchOfficialText(
    `${CAE_BASE}/feeds/directory/directory/action/Alpha/value/${letter}/cid/1498/id/2201/listingType/A`)));
  return pages.flatMap((html) => parseCanadianAcademyDirectoryPage(html, verifiedOn));
};

export const refreshAtse = async ({ verifiedOn, fixtureText } = {}) => {
  if (fixtureText != null) return parseAtseDirectoryPage(fixtureText, verifiedOn).records;
  const first = await fetchOfficialText(ATSE_LIST);
  const { total, records } = parseAtseDirectoryPage(first, verifiedOn);
  const pageCount = Math.max(1, Math.ceil(total / Math.max(records.length, 1)));
  const remaining = [];
  for (let page = 2; page <= pageCount; page += 1) remaining.push(fetchOfficialText(`${ATSE_LIST}?page=${page}`));
  return records.concat((await Promise.all(remaining)).flatMap((html) => parseAtseDirectoryPage(html, verifiedOn).records));
};

const raengForm = (token, page) => new URLSearchParams({ __RequestVerificationToken: token,
  ItemsPerPage: "100", CurrentPage: String(page), Term: "", TermName: "true", TermExpertise: "false",
  TermCompany: "false", TownCityCounty: "", ElectionYear: "", Region: "", FellowType: "" });
const http1Text = (url, { method = "GET", headers = {}, body = "", timeoutMs = 60000 } = {}) => new Promise((resolve, reject) => {
  const request = https.request(url, { method, headers: { "user-agent": "who-cite-your-works/1.0 (official membership cache)",
    accept: "text/html,*/*;q=0.8", ...headers }, ALPNProtocols: ["http/1.1"] }, (response) => {
    const chunks = [];
    response.on("data", (chunk) => chunks.push(chunk));
    response.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      if ((response.statusCode || 500) >= 400) reject(new Error(`${response.statusCode} while fetching ${url}`));
      else resolve({ text, headers: response.headers });
    });
  });
  request.setTimeout(timeoutMs, () => request.destroy(new Error(`Timeout while fetching ${url}`)));
  request.on("error", reject);
  if (body) request.write(body);
  request.end();
});
export const refreshRaeng = async ({ verifiedOn, fixtureText } = {}) => {
  if (fixtureText != null) return parseRaengDirectoryPage(fixtureText, verifiedOn).records;
  const landingResponse = await http1Text(RAENG_LIST);
  const landing = landingResponse.text;
  const cookies = landingResponse.headers["set-cookie"] || [];
  const cookie = cookies.map((value) => value.split(";", 1)[0]).join("; ");
  const token = decodeHtml(landing.match(/name="__RequestVerificationToken"[^>]+value="([^"]+)"/)?.[1]);
  if (!token) throw new Error("RAEng antiforgery token not found");
  const fetchPage = async (page) => {
    const body = raengForm(token, page).toString();
    return (await http1Text(RAENG_ENDPOINT, { method: "POST", body, headers: {
      "content-type": "application/x-www-form-urlencoded", "content-length": Buffer.byteLength(body),
      referer: RAENG_LIST, cookie } })).text;
  };
  const first = await fetchPage(1);
  const parsed = parseRaengDirectoryPage(first, verifiedOn);
  const records = [...parsed.records];
  for (let page = 2; page <= Math.ceil(parsed.total / 100); page += 1) {
    records.push(...parseRaengDirectoryPage(await fetchPage(page), verifiedOn).records);
  }
  return records;
};

export const refreshNae = async ({ verifiedOn, fixtureText } = {}) => {
  if (fixtureText != null) return parseNaeDirectoryPage(fixtureText, verifiedOn).records;
  const headers = { "user-agent": "who-cite-your-works/1.0 (official membership cache)", accept: "text/html,*/*;q=0.8" };
  const landingResponse = await fetch(NAE_LIST, { redirect: "follow", headers });
  if (!landingResponse.ok) throw new Error(`${landingResponse.status} while fetching ${NAE_LIST}`);
  const landing = await landingResponse.text();
  const cookie = (landingResponse.headers.getSetCookie?.() || [landingResponse.headers.get("set-cookie")])
    .filter(Boolean).map((value) => value.split(";", 1)[0]).join("; ");
  const hidden = [...landing.matchAll(/<input[^>]+type="hidden"[^>]+name="([^"]+)"[^>]*value="([^"]*)"[^>]*>/gi)]
    .map((match) => [decodeHtml(match[1]), match[2].replaceAll("&amp;", "&")]);
  const pageTarget = "ctl06$ctl05$ctl00$MembersList$members$ctl01$ctl22$filterTopPager$ddlPageIndex";
  const postPage = async (pageIndex) => {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const body = new URLSearchParams(hidden);
        body.set("__EVENTTARGET", pageTarget); body.set("__EVENTARGUMENT", ""); body.set(pageTarget, String(pageIndex));
        const response = await fetch(`${NAE_LIST}?id=20412`, { method: "POST", redirect: "follow", body,
          headers: { ...headers, "content-type": "application/x-www-form-urlencoded", cookie, referer: NAE_LIST },
          signal: AbortSignal.timeout(60000) });
        const html = await response.text();
        if (!response.ok || /GenericErrorPage/.test(response.url) || !/class="tplPerson"/.test(html)) {
          throw new Error(`NAE page ${pageIndex + 1} returned an invalid response`);
        }
        return html;
      } catch (error) {
        lastError = error;
        if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 750));
      }
    }
    throw lastError;
  };
  const first = parseNaeDirectoryPage(landing, verifiedOn);
  const pageCount = Math.ceil(first.total / 20);
  const pages = new Array(Math.max(0, pageCount - 1));
  let cursor = 0;
  const worker = async () => {
    while (cursor < pages.length) {
      const index = cursor++;
      pages[index] = await postPage(index + 1);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return first.records.concat(pages.flatMap((html) => parseNaeDirectoryPage(html, verifiedOn).records));
};
