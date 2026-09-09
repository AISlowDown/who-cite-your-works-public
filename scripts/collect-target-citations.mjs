import fs from "node:fs/promises";

const root = process.env.CITATION_RADAR_WORKSPACE || process.cwd();
const targetAuthorId = process.argv[2];
const slug = process.argv[3];
if (!targetAuthorId || !slug) {
  throw new Error("Usage: node scripts/collect-target-citations.mjs <openalex-author-id> <researcher-slug> [orcid] [date] [institution-supplement.json]");
}
const targetOrcid = process.argv[4] || "";
const generatedOn = process.argv[5] || new Date().toISOString().slice(0, 10);
const supplementPath = process.argv[6] || `${root}/citation-radar/config/${slug}-priority-supplement.json`;
const outputPath = `${root}/citation-radar/reports/${generatedOn}/${slug}-citation-candidates.json`;
const institutionCache = JSON.parse(await fs.readFile(`${root}/citation-radar/config/institution-priority-cache.json`, "utf8"));
const institutionSupplement = JSON.parse(await fs.readFile(supplementPath, "utf8").catch(() => '{"institutions":{}}'));
const institutionInfo = (name) => institutionCache.institutions?.[name] || institutionSupplement.institutions?.[name];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function getJson(url) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "who-cite-your-works/1.0" } });
    if (response.ok) return response.json();
    await sleep(500 * (attempt + 1));
  }
  throw new Error(`OpenAlex request failed: ${url}`);
}

async function getJsonOrNull(url) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "who-cite-your-works/1.0" } });
    if (response.ok) return response.json();
    if (response.status === 404) return null;
    await sleep(400 * (attempt + 1));
  }
  return null;
}

async function listWorks(filter) {
  const items = [];
  let cursor = "*";
  do {
    const url = new URL("https://api.openalex.org/works");
    url.searchParams.set("filter", filter);
    url.searchParams.set("per-page", "200");
    url.searchParams.set("cursor", cursor);
    url.searchParams.set("select", "id,doi,title,display_name,publication_year,publication_date,cited_by_count,authorships,primary_location,open_access,best_oa_location");
    const page = await getJson(url);
    items.push(...page.results);
    cursor = page.meta?.next_cursor;
  } while (cursor);
  return items;
}

const normalizeDoi = (value) => String(value || "").toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, "");
const orcidWorks = targetOrcid
  ? await getJson(`https://pub.orcid.org/v3.0/${targetOrcid}/works`)
  : { group: [] };
const orcidDois = new Set((orcidWorks?.group || []).flatMap((group) => group["work-summary"] || [])
  .flatMap((work) => work["external-ids"]?.["external-id"] || [])
  .filter((externalId) => String(externalId["external-id-type"] || "").toLowerCase() === "doi")
  .map((externalId) => normalizeDoi(externalId["external-id-value"]))
  .filter(Boolean));
const authorWorks = await listWorks(`author.id:${targetAuthorId}`);
const targetWorksById = new Map(authorWorks.map((work) => [work.id, work]));
const doiList = [...orcidDois];
for (let index = 0; index < doiList.length; index += 5) {
  const batch = doiList.slice(index, index + 5);
  const works = await Promise.all(batch.map((doi) => getJsonOrNull(`https://api.openalex.org/works/https://doi.org/${doi}`)));
  for (const work of works.filter(Boolean)) targetWorksById.set(work.id, work);
}
const targetWorks = [...targetWorksById.values()];
const citationPairs = [];
for (let index = 0; index < targetWorks.length; index += 5) {
  const batch = targetWorks.slice(index, index + 5);
  const pages = await Promise.all(batch.map((work) => listWorks(`cites:${work.id.split("/").pop()}`)));
  for (let offset = 0; offset < batch.length; offset += 1) {
    for (const citingWork of pages[offset]) citationPairs.push({ targetWork: batch[offset], citingWork });
  }
  process.stderr.write(`\rCitation traversal ${Math.min(index + 5, targetWorks.length)}/${targetWorks.length}`);
}
process.stderr.write("\n");

const roleAuthorships = [];
const selfCitationPairs = [];
const externalCitationPairs = [];
for (const pair of citationPairs) {
  const authorIds = (pair.citingWork.authorships || []).map((authorship) => authorship.author?.id).filter(Boolean);
  if (authorIds.some((id) => id === targetAuthorId || id.endsWith(`/${targetAuthorId}`))) {
    selfCitationPairs.push(pair);
    continue;
  }
  externalCitationPairs.push(pair);
  for (const authorship of pair.citingWork.authorships || []) {
    if (authorship.author_position !== "first" && !authorship.is_corresponding) continue;
    roleAuthorships.push({ pair, authorship });
  }
}

const authorIds = [...new Set(roleAuthorships.map(({ authorship }) => authorship.author?.id).filter(Boolean))];
const authors = new Map();
for (let index = 0; index < authorIds.length; index += 8) {
  const batch = authorIds.slice(index, index + 8);
  const profiles = await Promise.all(batch.map((id) => getJson(`https://api.openalex.org/authors/${id.split("/").pop()}?select=id,display_name,orcid,cited_by_count,works_count,last_known_institutions`)));
  for (const profile of profiles) authors.set(profile.id, profile);
}

const candidates = roleAuthorships.map(({ pair, authorship }) => {
  const profile = authors.get(authorship.author.id) || {};
  const paperAffiliations = [...new Set((authorship.institutions || []).map((item) => item.display_name).filter(Boolean))];
  const priorityAffiliations = paperAffiliations.filter((name) => institutionInfo(name)?.priority === true);
  const missingAffiliations = paperAffiliations.filter((name) => institutionInfo(name) == null);
  return {
    targetWork: {
      id: pair.targetWork.id,
      doi: pair.targetWork.doi,
      title: pair.targetWork.title,
      year: pair.targetWork.publication_year,
    },
    citingWork: {
      id: pair.citingWork.id,
      doi: pair.citingWork.doi,
      title: pair.citingWork.title,
      year: pair.citingWork.publication_year,
      citedByCount: pair.citingWork.cited_by_count,
      landingPageUrl: pair.citingWork.primary_location?.landing_page_url || null,
      pdfUrl: pair.citingWork.best_oa_location?.pdf_url || pair.citingWork.primary_location?.pdf_url || null,
      authorIds: (pair.citingWork.authorships || []).map((item) => item.author?.id).filter(Boolean),
      isSelfCitation: false,
    },
    citingAuthor: {
      id: profile.id || authorship.author.id,
      name: profile.display_name || authorship.author.display_name,
      orcid: profile.orcid || null,
      citedByCount: profile.cited_by_count || 0,
      worksCount: profile.works_count || 0,
      roles: [...new Set([authorship.author_position === "first" ? "第一作者" : null, authorship.is_corresponding ? "通讯作者" : null].filter(Boolean))],
      paperAffiliations,
      priorityAffiliations,
      missingAffiliations,
    },
  };
}).filter((item) => item.citingAuthor.citedByCount > 5000);

const strictCandidates = candidates.filter((item) => item.citingAuthor.priorityAffiliations.length > 0);
const unique = (items) => [...new Set(items)];
const output = {
  generatedOn,
  scope: {
    targetAuthorId,
    citingAuthorCitationThreshold: ">5000",
    citingAuthorRoles: ["第一作者", "通讯作者"],
    institutions: "国内985/211/第二轮双一流；港澳台和国外QS 2027前200",
    selfCitations: "剔除引用论文作者名单中包含目标研究者本人的全部场景",
  },
  stats: {
    targetWorks: targetWorks.length,
    authorEntityWorks: authorWorks.length,
    orcidRegisteredDois: orcidDois.size,
    citationPairs: citationPairs.length,
    selfCitationPairsExcluded: selfCitationPairs.length,
    externalCitationPairs: externalCitationPairs.length,
    roleAuthorScenarios: roleAuthorships.length,
    overThresholdScenarios: candidates.length,
    strictPriorityScenarios: strictCandidates.length,
    strictPriorityAuthors: unique(strictCandidates.map((item) => item.citingAuthor.id)).length,
  },
  missingInstitutionsToVerify: unique(candidates.flatMap((item) => item.citingAuthor.missingAffiliations)),
  candidates,
  strictCandidates,
};
await fs.mkdir(`${root}/citation-radar/reports/${generatedOn}`, { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ outputPath, ...output.stats, missingInstitutionsToVerify: output.missingInstitutionsToVerify }, null, 2));
