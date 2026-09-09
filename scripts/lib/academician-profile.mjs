const decodeHtml = (value = "") => String(value)
  .replace(/&ensp;|&emsp;|&nbsp;|&#160;/gi, " ")
  .replace(/&middot;/gi, "·")
  .replace(/&amp;/gi, "&")
  .replace(/&#39;|&apos;/gi, "'")
  .replace(/&quot;/gi, '"')
  .replace(/<br\s*\/?>/gi, "\n")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const unique = (values) => [...new Set(values.map((value) => value.trim()).filter(Boolean))];
const institutionSuffix = "(?:大学|学院|研究院|研究所|医院|实验室|中心|公司)";

const currentAffiliationsFrom = (text) => unique([...text.matchAll(
  new RegExp(`(?:现任|目前任|现就职于|现工作于|工作单位为)([^\uff0c。；]{2,80}${institutionSuffix})`, "g"))]
  .map((match) => match[1].replace(/^(?:在|于)/, "")));

const careerAffiliationsFrom = (text) => unique([...text.matchAll(
  new RegExp(`(?:曾在|曾任职于|曾工作于)([^\uff0c。；]{2,80}${institutionSuffix})(?:工作|任职)?`, "g"))]
  .map((match) => match[1].replace(/^(?:在|于)/, "")));

const specialtyFrom = (text) => text.match(/(?:主要|长期)?从事([^\u3002；]{2,160}(?:研究|工作))/)?.[1]?.trim()
  || text.match(/^([^\u3002；]{2,80}专家)/)?.[1]?.trim() || null;

const electionYearFrom = (text) => {
  const match = String(text).match(/((?:19|20)\d{2})年(?:当选(?:为)?|增选为)(?:中国)?(?:科学院|工程院)(?:(?:外籍)?院士|学部委员\s*[（(]院士[）)])/)
    || String(text).match(/当选院士年份[\s\S]{0,80}?((?:19|20)\d{2})年?/)
    || String(text).match(/(?:^|\n)\s*((?:19|20)\d{2})年\s+(?:中国)?(?:科学院|工程院)(?:外籍)?(?:院士)?\s*(?:\n|$)/m);
  return match ? Number(match[1]) : null;
};

const buildProfile = ({ name, biographyHtml, sourceUrl }) => {
  const profileText = decodeHtml(biographyHtml);
  const currentAffiliations = currentAffiliationsFrom(profileText);
  const careerAffiliations = careerAffiliationsFrom(profileText)
    .filter((value) => !currentAffiliations.includes(value));
  return { name: decodeHtml(name), currentAffiliations, careerAffiliations,
    specialty: specialtyFrom(profileText), electionYear: electionYearFrom(profileText), profileText, sourceUrl };
};

const cellsFromRow = (row) => [...String(row).matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
  .map((match) => decodeHtml(match[1]));

export const parseAcademicianHallProfile = (html, sourceUrl) => {
  const text = decodeHtml(html);
  const name = decodeHtml(html.match(/姓名[\s\S]{0,120}?<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i)?.[1]
    || text.match(/姓名[\s：:]+([^\s，。；]{2,30})/)?.[1] || "");
  const experienceHtml = html.match(/主要经历([\s\S]*?)(?:主要成就|院士印象|本资料由|<footer|$)/i)?.[1] || "";
  const rows = [...experienceHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((match) => cellsFromRow(match[1]))
    .filter((cells) => cells.length >= 3 && !cells.some((cell) => /工作单位/.test(cell)));
  const careerAffiliations = [];
  const currentAffiliations = [];
  for (const cells of rows) {
    const [start, end, affiliation] = cells;
    if (!affiliation || !start || !/\D/.test(affiliation)) continue;
    careerAffiliations.push(affiliation);
    if (!end) currentAffiliations.push(affiliation);
  }
  return { name, currentAffiliations: unique(currentAffiliations),
    careerAffiliations: unique(careerAffiliations), specialty: specialtyFrom(text),
    electionYear: electionYearFrom(text), profileText: text, sourceUrl };
};

export const parseAcademicianHallText = (rawText, sourceUrl) => {
  const profileText = String(rawText || "").replace(/\r/g, "").replace(/[\t ]+/g, " ").trim();
  const name = profileText.match(/姓名[\s：:]+([^\s，。；]{2,30})/)?.[1] || "";
  const experienceText = profileText.match(/主要经历([\s\S]*?)(?:本资料由|主要成就|$)/)?.[1] || "";
  const careerAffiliations = [];
  const sourceDateAffiliations = [];
  const titlePattern = /\s+(?:教授|副教授|研究员|副研究员|院士|主任|副主任|院长|副院长|所长|副所长|总工程师|副总工程师|高级工程师|工程师|讲师|助教|委员|校长|副校长).*$/;
  for (const rawLine of experienceText.split(/\n+/)) {
    const line = rawLine.trim();
    const dated = line.match(/^((?:19|20)\d{2})年\s*(?:[-–—]\s*((?:19|20)\d{2})年)?\s+(.+)$/);
    if (!dated) continue;
    const affiliation = dated[3].replace(titlePattern, "").trim();
    if (!affiliation || affiliation.length < 2) continue;
    careerAffiliations.push(affiliation);
    if (!dated[2]) sourceDateAffiliations.push(affiliation);
  }
  return { name, currentAffiliations: [], sourceDateAffiliations: unique(sourceDateAffiliations),
    careerAffiliations: unique(careerAffiliations), specialty: specialtyFrom(profileText),
    electionYear: electionYearFrom(profileText), profileText, sourceUrl };
};

export const parseCasProfile = (html, sourceUrl) => buildProfile({
  name: html.match(/class="wztitle"[^>]*>([\s\S]*?)<\//i)?.[1] || "",
  biographyHtml: html.match(/class="acadTxt"[^>]*>([\s\S]*?)(?:<div class="Previous_Next"|<\/div>\s*<\/div>)/i)?.[1]
    || html.match(/class="acadTxt"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || "",
  sourceUrl,
});

export const parseCaeProfile = (html, sourceUrl) => buildProfile({
  name: html.match(/class="right_md_name"[^>]*>([\s\S]*?)<\//i)?.[1] || "",
  biographyHtml: html.match(/class="intro"[^>]*>([\s\S]*?)<\/div>/i)?.[1] || "",
  sourceUrl,
});

export const enrichAcademicianRecord = (record, profile, verifiedOn) => ({
  ...record,
  listedAffiliations: unique([...(record.listedAffiliations || []), ...(profile.currentAffiliations || [])]),
  currentAffiliations: unique([...(record.currentAffiliations || []), ...(profile.currentAffiliations || [])]),
  careerAffiliations: unique([...(record.careerAffiliations || []), ...(profile.careerAffiliations || [])]),
  electionYear: record.electionYear || profile.electionYear || electionYearFrom(profile.profileText) || null,
  specialty: profile.specialty || record.specialty || null,
  profileEvidence: { sourceUrl: profile.sourceUrl || record.officialProfileUrl,
    verifiedOn, excerpt: profile.profileText || "" },
  profileFetchStatus: "success",
});

export const enrichAcademicianCache = async (cache, { fetchProfile, priorProfiles = {}, resume = true,
  verifiedOn, concurrency = 8, onProgress } = {}) => {
  const records = new Array(cache.records.length);
  const profiles = { ...priorProfiles };
  let cursor = 0;
  let completed = 0;
  const worker = async () => {
    while (cursor < cache.records.length) {
      const index = cursor++;
      const record = cache.records[index];
      try {
        let profile;
        if (resume && profiles[record.id]?.status === "success") profile = profiles[record.id].profile;
        else {
          profile = await fetchProfile(record);
          profiles[record.id] = { status: "success", profile, fetchedOn: verifiedOn };
        }
        records[index] = enrichAcademicianRecord(record, profile, verifiedOn);
      } catch (error) {
        profiles[record.id] = { status: "failed", error: error.message, attemptedOn: verifiedOn };
        records[index] = { ...record, listedAffiliations: record.listedAffiliations || [],
          currentAffiliations: record.currentAffiliations || [], careerAffiliations: record.careerAffiliations || [],
          profileFetchStatus: "failed-retained", profileFetchError: error.message };
      }
      completed += 1;
      onProgress?.({ completed, total: cache.records.length, record: records[index] });
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, cache.records.length || 1)) }, worker));
  const affiliationCount = records.filter((record) => record.listedAffiliations?.length).length;
  return { cache: { ...cache, verifiedOn, records,
    profileEnrichment: { verifiedOn, total: records.length,
      success: records.filter((record) => record.profileFetchStatus === "success").length,
      failed: records.filter((record) => record.profileFetchStatus === "failed-retained").length,
      affiliationCount, affiliationRate: records.length ? affiliationCount / records.length : 0 } }, profiles };
};
