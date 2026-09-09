import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { enrichProfileMemberships, verifiedMembershipHonor } from "./lib/membership-profile-enrichment.mjs";

const slug = process.argv[2];
if (!slug) throw new Error("Usage: node scripts/enrich-target-author-profiles.mjs <researcher-slug> [date] [data-dir]");
const generatedOn = process.argv[3] || new Date().toISOString().slice(0, 10);
const dataRoot = path.resolve(process.argv[4] || process.env.CITATION_RADAR_DATA_DIR || "citation-radar");
const inputPath = path.join(dataRoot, "reports", generatedOn, `${slug}-citation-candidates.json`);
const outputPath = path.join(dataRoot, "config", `${slug}-author-profiles.json`);
const report = JSON.parse(await fs.readFile(inputPath, "utf8"));
const skillRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const [academicians, fellows] = await Promise.all([
  fs.readFile(path.join(skillRoot, "data", "chinese-academicians-cache.json"), "utf8").then(JSON.parse),
  fs.readFile(path.join(skillRoot, "data", "international-fellows-cache.json"), "utf8").then(JSON.parse),
]);

const authors = [...new Map(report.strictCandidates.map((row) => [row.citingAuthor.id, row.citingAuthor])).values()];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value = "") => String(value).normalize("NFKD").toLowerCase()
  .replace(/university|universiti|the|of|and|technology|institute|polytechnic|college|school/g, " ")
  .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ").trim();
const words = (value) => new Set(clean(value).split(/\s+/).filter((x) => x.length > 2));
const orgMatches = (org, affiliations) => {
  const left = words(org);
  return affiliations.some((affiliation) => {
    const right = words(affiliation);
    const overlap = [...left].filter((word) => right.has(word));
    return overlap.length >= 1 && (overlap.length >= Math.min(2, left.size, right.size)
      || clean(org).includes(clean(affiliation)) || clean(affiliation).includes(clean(org)));
  });
};

const roleZh = (role) => {
  const value = String(role || "").trim();
  const lowered = value.toLowerCase();
  const dictionary = [
    [/president/, "校长/主席"],
    [/vice president|vice-president/, "副校长/副主席"],
    [/dean/, "院长"],
    [/department head|head of department|chair of department/, "系主任"],
    [/director/, "主任"],
    [/chair professor|endowed professor/, "讲席教授"],
    [/distinguished professor/, "杰出教授"],
    [/emeritus professor|professor emeritus/, "荣休教授"],
    [/associate professor|reader/, "副教授"],
    [/assistant professor/, "助理教授"],
    [/full professor|professor|prof\.?$/, "教授"],
    [/principal investigator/, "课题组负责人"],
    [/chief scientist/, "首席科学家"],
    [/senior scientist/, "高级科学家"],
    [/senior lecturer/, "高级讲师"],
    [/lecturer/, "讲师"],
    [/postdoctoral|postdoc/, "博士后研究员"],
    [/research fellow/, "研究员/研究学者"],
    [/research associate/, "研究助理/研究学者"],
    [/researcher|scientist/, "研究人员"],
    [/phd student|doctoral student|phd candidate/, "博士研究生"],
  ];
  const hit = dictionary.find(([pattern]) => pattern.test(lowered));
  return hit ? hit[1] : value;
};

async function getJson(url) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "who-cite-your-works/1.0 (academic research)" },
    });
    if (response.ok) return response.json();
    if ([429, 500, 502, 503, 504].includes(response.status)) {
      await sleep(500 * attempt);
      continue;
    }
    return null;
  }
  return null;
}

const summaries = (payload, key, summaryKey) => (payload?.[key] || [])
  .flatMap((group) => group.summaries || [])
  .map((item) => item?.[summaryKey])
  .filter(Boolean);
const uniq = (values) => [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];

async function enrich(author) {
  const orcid = author.orcid?.split("/").pop();
  const affiliations = uniq([...(author.paperAffiliations || []), ...(author.priorityAffiliations || [])]);
  const base = {
    name: author.name,
    title: "引用论文作者（公开档案未列明具体职称）",
    honor: "未发现可核验的公开人才/荣誉信息",
    sourceUrls: [],
    matchMethod: "论文姓名与署名机构已匹配",
  };
  const applyMemberships = () => {
    const result = enrichProfileMemberships({ author: { name: author.name, orcid },
      paperAffiliations: author.paperAffiliations || author.priorityAffiliations || [],
      currentAffiliations: author.lastKnownAffiliations || [],
      identitySignals: author.officialIdentitySignals || [], caches: { academicians, fellows } });
    const honor = verifiedMembershipHonor(result);
    base.membershipEvidence = result.membershipEvidence;
    if (honor) base.honor = honor;
    return base;
  };
  if (!orcid) return applyMemberships();

  const orcidUrl = `https://orcid.org/${orcid}`;
  const [employments, distinctions, invited, memberships, educations] = await Promise.all([
    getJson(`https://pub.orcid.org/v3.0/${orcid}/employments`),
    getJson(`https://pub.orcid.org/v3.0/${orcid}/distinctions`),
    getJson(`https://pub.orcid.org/v3.0/${orcid}/invited-positions`),
    getJson(`https://pub.orcid.org/v3.0/${orcid}/memberships`),
    getJson(`https://pub.orcid.org/v3.0/${orcid}/educations`),
  ]);

  const employmentRows = summaries(employments, "affiliation-group", "employment-summary")
    .filter((row) => row?.["role-title"] && orgMatches(row?.organization?.name || "", affiliations));
  const currentEmployment = employmentRows.filter((row) => !row?.["end-date"]);
  const titleRows = currentEmployment.length ? currentEmployment : employmentRows;
  const titles = uniq(titleRows.map((row) => `${row.organization?.name || ""} ${roleZh(row["role-title"])}`.trim()));

  const invitedRows = summaries(invited, "affiliation-group", "invited-position-summary")
    .filter((row) => row?.["role-title"] && orgMatches(row?.organization?.name || "", affiliations));
  const invitedTitles = uniq(invitedRows.map((row) => `${row.organization?.name || ""} ${roleZh(row["role-title"])}`.trim()));
  if (titles.length || invitedTitles.length) {
    base.title = uniq([...titles, ...invitedTitles]).join(" • ");
    base.sourceUrls.push(orcidUrl);
    base.matchMethod = "ORCID任职/受邀岗位与引用论文署名机构匹配";
  }

  if (base.title.includes("未列明")) {
    const educationRows = summaries(educations, "affiliation-group", "education-summary")
      .filter((row) => !row?.["end-date"] && row?.["role-title"] && orgMatches(row?.organization?.name || "", affiliations));
    const educationTitles = uniq(educationRows.map((row) => {
      const degree = String(row["role-title"]);
      const degreeZh = /ph\.?d|doctor/i.test(degree) ? "博士研究生"
        : /master|m\.?sc|m\.?eng/i.test(degree) ? "硕士研究生" : `在读学生（${degree}）`;
      return `${row.organization?.name || ""} ${degreeZh}`.trim();
    }));
    if (educationTitles.length) {
      base.title = educationTitles.join(" • ");
      base.sourceUrls.push(orcidUrl);
      base.matchMethod = "ORCID在读教育机构与引用论文署名机构匹配";
    }
  }

  const distinctionRows = summaries(distinctions, "affiliation-group", "distinction-summary");
  const membershipRows = summaries(memberships, "affiliation-group", "membership-summary");
  const honors = uniq([
    ...distinctionRows.filter((row) => row?.["role-title"]).map((row) => `${row["role-title"]}${row.organization?.name ? `（${row.organization.name}）` : ""}`),
    ...membershipRows.filter((row) => row?.["role-title"] && /fellow|academ|member|society|association|institute/i.test(row["role-title"]))
      .map((row) => `${row["role-title"]}${row.organization?.name ? `（${row.organization.name}）` : ""}`),
  ]);
  if (honors.length) {
    base.orcidHonorCandidates = honors;
    if (!base.sourceUrls.includes(orcidUrl)) base.sourceUrls.push(orcidUrl);
  }
  return applyMemberships();
}

const entries = [];
for (let index = 0; index < authors.length; index += 6) {
  const batch = authors.slice(index, index + 6);
  const results = await Promise.all(batch.map(enrich));
  entries.push(...results.map((value, offset) => [batch[offset].id, value]));
  process.stderr.write(`\rORCID enrichment ${Math.min(index + 6, authors.length)}/${authors.length}`);
}
process.stderr.write("\n");

const output = {
  generatedOn: new Date().toISOString(),
  authorCount: authors.length,
  profiles: Object.fromEntries(entries),
};
await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({
  outputPath,
  authorCount: authors.length,
  titlesFound: entries.filter(([, value]) => !value.title.includes("未列明")).length,
  honorsFound: entries.filter(([, value]) => !value.honor.startsWith("未发现")).length,
}, null, 2));
