import fs from "node:fs/promises";

const root = process.env.CITATION_RADAR_WORKSPACE || process.cwd();
const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  throw new Error("Usage: node scripts/enrich-author-profiles-orcid.mjs <author-profile-cache.json> <output.json>");
}
const data = JSON.parse(await fs.readFile(inputPath, "utf8"));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (value = "") => String(value).normalize("NFKD").toLowerCase()
  .replace(/university|universiti|the|of|and|technology|institute|polytechnic/g, " ")
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
    [/chair professor|distinguished professor/, "讲席教授/杰出教授"],
    [/associate professor|reader/, "副教授"],
    [/assistant professor/, "助理教授"],
    [/full professor|professor|prof\.?$/, "教授"],
    [/senior lecturer/, "高级讲师"],
    [/lecturer/, "讲师"],
    [/postdoctoral|postdoc/, "博士后研究员"],
    [/research fellow/, "研究员/研究学者"],
    [/research associate/, "研究助理/研究学者"],
    [/researcher|scientist/, "研究人员"],
    [/dean/, "院长"],
    [/director/, "主任"],
    [/phd student|doctoral student|phd candidate/, "博士研究生"],
  ];
  const hit = dictionary.find(([pattern]) => pattern.test(lowered));
  return hit ? hit[1] : value;
};

async function getJson(url, accept = "application/json") {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, { headers: { Accept: accept, "User-Agent": "who-cite-your-works/1.0" } });
    if (response.ok) return response.json();
    await sleep(350 * (attempt + 1));
  }
  return null;
}

const summaries = (payload, key, summaryKey) => (payload?.[key] || [])
  .flatMap((group) => group.summaries || [])
  .map((item) => item?.[summaryKey])
  .filter(Boolean);

async function enrich(author) {
  const affiliations = author.paperAffiliations || [];
  const openalexId = author.openalexId.split("/").pop();
  const oa = await getJson(`https://api.openalex.org/authors/${openalexId}`);
  const orcid = oa?.orcid?.split("/").pop();
  const base = {
    name: author.name,
    title: "引用论文作者（公开作者档案未列明具体职称）",
    honor: "未发现公开人才/荣誉信息",
    sourceUrls: [],
    matchMethod: "论文姓名与署名机构已保留；未使用无法与论文方向和机构同时匹配的同名身份",
    checkedOn: "2026-09-01",
  };
  if (!orcid) return base;

  const orcidUrl = `https://orcid.org/${orcid}`;
  const [employments, distinctions, invited, educations] = await Promise.all([
    getJson(`https://pub.orcid.org/v3.0/${orcid}/employments`),
    getJson(`https://pub.orcid.org/v3.0/${orcid}/distinctions`),
    getJson(`https://pub.orcid.org/v3.0/${orcid}/invited-positions`),
    getJson(`https://pub.orcid.org/v3.0/${orcid}/educations`),
  ]);
  const employmentRows = summaries(employments, "affiliation-group", "employment-summary");
  const matched = employmentRows.filter((row) => orgMatches(row?.organization?.name || "", affiliations));
  const current = matched.filter((row) => !row?.["end-date"]).concat(matched).find((row) => row?.["role-title"]);
  if (current) {
    const org = current.organization?.name;
    base.title = `${org} ${roleZh(current["role-title"])}`;
    base.matchMethod = "ORCID任职机构与引用论文署名机构匹配";
    base.sourceUrls.push(orcidUrl);
  }

  const invitedRows = summaries(invited, "affiliation-group", "invited-position-summary");
  const matchedInvited = invitedRows.filter((row) => orgMatches(row?.organization?.name || "", affiliations));
  if (!current && matchedInvited.some((row) => row?.["role-title"])) {
    base.title = [...new Set(matchedInvited.filter((row) => row?.["role-title"]).map((row) => `${row.organization?.name || ""} ${roleZh(row["role-title"])}`.trim()))].join(" • ");
    base.matchMethod = "ORCID受邀岗位机构与引用论文署名机构匹配";
    base.sourceUrls.push(orcidUrl);
  }

  const educationRows = summaries(educations, "affiliation-group", "education-summary");
  const currentEducation = educationRows.find((row) => !row?.["end-date"]
    && row?.["role-title"] && orgMatches(row?.organization?.name || "", affiliations));
  if (!current && !matchedInvited.some((row) => row?.["role-title"]) && currentEducation) {
    const degree = String(currentEducation["role-title"]);
    const degreeZh = /ph\.?d|doctor/i.test(degree) ? "博士研究生"
      : /master|m\.?sc|m\.?eng/i.test(degree) ? "硕士研究生" : `在读学生（${degree}）`;
    base.title = `${currentEducation.organization?.name || ""} ${degreeZh}`.trim();
    base.matchMethod = "ORCID在读教育机构与引用论文署名机构匹配";
    base.sourceUrls.push(orcidUrl);
  }

  const distinctionRows = summaries(distinctions, "affiliation-group", "distinction-summary");
  const honors = distinctionRows
    .filter((row) => row?.["role-title"])
    .map((row) => `${row["role-title"]}${row.organization?.name ? `（${row.organization.name}）` : ""}`);
  if (honors.length) {
    base.honor = [...new Set(honors)].join(" • ");
    if (!base.sourceUrls.includes(orcidUrl)) base.sourceUrls.push(orcidUrl);
  }

  const profile = author.profileVerification || {};
  const usablePosition = profile.currentTitle || profile.currentPosition || profile.formalTitle;
  if (base.title.includes("未列明") && usablePosition && !["待核验", "证据不足"].includes(usablePosition)) {
    base.title = usablePosition;
    base.sourceUrls.push(...(profile.sourceUrls || []));
    base.matchMethod = "论文署名机构与已取得的学校/论文档案匹配";
  }
  return base;
}

const unresolved = data.authors.filter((author) => author.profileVerification?.verificationStatus !== "已核验职称");
const entries = [];
for (let index = 0; index < unresolved.length; index += 6) {
  const batch = unresolved.slice(index, index + 6);
  const results = await Promise.all(batch.map(enrich));
  entries.push(...results.map((value, offset) => [batch[offset].openalexId, value]));
  process.stderr.write(`\rORCID enrichment ${Math.min(index + 6, unresolved.length)}/${unresolved.length}`);
}
process.stderr.write("\n");

const output = {
  generatedOn: "2026-09-01",
  method: "论文作者记录 -> OpenAlex ORCID -> 与论文署名机构匹配的 ORCID 任职/荣誉；不匹配时保留明确的未公开结论",
  authorCount: entries.length,
  profiles: Object.fromEntries(entries),
};
await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, authorCount: entries.length, matchedTitles: entries.filter(([, value]) => !value.title.includes("未列明")).length, honorsFound: entries.filter(([, value]) => !value.honor.startsWith("未发现")).length }, null, 2));
