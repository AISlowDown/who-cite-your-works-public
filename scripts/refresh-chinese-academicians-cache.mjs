import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const dataDir = path.join(skillRoot, "data");
const snapshotDate = new Date().toISOString().slice(0, 10);
const stablePath = path.join(dataDir, "chinese-academicians-cache.json");
const snapshotPath = path.join(dataDir, `chinese-academicians-cache-${snapshotDate}.json`);

const sources = {
  casDomestic: "https://casad.cas.cn/ysxx2022/ysmd/qtys/",
  casForeign: "https://casad.cas.cn/ysxx2022/wjys/",
  caeDomestic: "https://www.cae.cn/cae/html/main/col53/column_53_1.html",
  caeForeign: "https://www.cae.cn/cae/html/main/col50/column_50_1.html",
};

const casDivisions = {
  sxwl: "数学物理学部",
  hxb: "化学部",
  smkx: "生命科学和医学学部",
  dxb: "地学部",
  xxjs: "信息技术科学部",
  jskx: "技术科学部",
};

const decodeHtml = (value = "") => String(value)
  .replace(/&emsp;|&nbsp;/g, " ")
  .replace(/&middot;/g, "·")
  .replace(/&auml;/g, "ä")
  .replace(/&ouml;/g, "ö")
  .replace(/&uuml;/g, "ü")
  .replace(/&amp;/g, "&")
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&quot;/g, '"')
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const normalizeName = (value = "") => decodeHtml(value)
  .normalize("NFKC")
  .replace(/[（）()·.\-_'’\s]/g, "")
  .toLowerCase();

async function fetchText(url) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const response = await fetch(url, {
      headers: { "user-agent": "who-cite-your-works/1.0 (official-list cache)" },
      redirect: "follow",
    });
    if (response.ok) return response.text();
    if ([429, 500, 502, 503, 504].includes(response.status) && attempt < 4) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      continue;
    }
    throw new Error(`${response.status} while fetching ${url}`);
  }
  throw new Error(`Failed to fetch ${url}`);
}

const absolute = (href, base) => new URL(href.replace(/^http:/, "https:"), base).href;

function parseCasDomestic(html) {
  const records = [];
  const pattern = /<a\s+href="([^"]*\/ysmd\/(sxwl|hxb|smkx|dxb|xxjs|jskx)\/[^"]+\.html)"[^>]*>([^<]+)<\/a>/g;
  for (const match of html.matchAll(pattern)) {
    const name = decodeHtml(match[3]);
    if (!name || name.includes("名单")) continue;
    records.push({
      id: `cas:${match[1].match(/t\d+_(\d+)\.html/)?.[1] || normalizeName(name)}`,
      name,
      aliases: [name],
      academy: "中国科学院",
      memberType: "院士",
      divisions: [casDivisions[match[2]]],
      senior: null,
      country: "中国",
      electionYear: null,
      specialty: null,
      officialProfileUrl: absolute(match[1], sources.casDomestic),
      officialListUrl: sources.casDomestic,
    });
  }
  return records;
}

function parseCasForeign(html) {
  const records = [];
  const pattern = /<a\s+href="([^"]*\/ysxx2022\/wjys\/[^"]+\.html)"[^>]*>([^<]+)<\/a>/g;
  for (const match of html.matchAll(pattern)) {
    const raw = decodeHtml(match[2]);
    if (!raw || raw.includes("名单")) continue;
    const bilingual = raw.match(/^(.+?)[（(]\s*([^）)]+)\s*[）)]$/);
    const name = bilingual ? bilingual[1].trim() : raw;
    const nameEn = bilingual ? bilingual[2].trim() : null;
    records.push({
      id: `cas-foreign:${match[1].match(/t\d+_(\d+)\.html/)?.[1] || normalizeName(raw)}`,
      name,
      nameEn,
      aliases: [...new Set([name, nameEn, raw].filter(Boolean))],
      academy: "中国科学院",
      memberType: "外籍院士",
      divisions: [],
      senior: null,
      country: null,
      electionYear: null,
      specialty: null,
      officialProfileUrl: absolute(match[1], sources.casForeign),
      officialListUrl: sources.casForeign,
    });
  }
  return records;
}

function parseCaeDomestic(html) {
  const byId = new Map();
  let division = null;
  let senior = false;
  const tokenPattern = /<div[^>]*class="[^"]*ysmd_bt\s+xbysmd_bt[^"]*"[^>]*>([\s\S]*?)<\/div>|<div[^>]*class="zsys"[^>]*>([\s\S]*?)<\/div>|<li\s+class="name_list"><a\s+href="([^"]+)"[^>]*>([^<]+)<\/a><\/li>/g;
  for (const match of html.matchAll(tokenPattern)) {
    if (match[1]) {
      const heading = decodeHtml(match[1]);
      division = heading.match(/([^\s(（]+学部)/)?.[1] || null;
      senior = false;
      continue;
    }
    if (match[2]) {
      senior = true;
      continue;
    }
    if (!match[3] || !division) continue;
    const rawName = decodeHtml(match[4]);
    const female = /[（(]女[）)]/.test(rawName);
    const name = rawName.replace(/[（(]女[）)]/g, "").trim();
    const profileUrl = absolute(match[3], sources.caeDomestic);
    const profileId = profileUrl.match(/\/([^/]+)\.html$/)?.[1] || normalizeName(name);
    const id = `cae:${profileId}`;
    const current = byId.get(id) || {
      id, name, aliases: [name], academy: "中国工程院", memberType: "院士",
      divisions: [], senior: false, gender: female ? "女" : null, country: "中国",
      electionYear: null, specialty: null, officialProfileUrl: profileUrl,
      officialListUrl: sources.caeDomestic,
    };
    if (!current.divisions.includes(division)) current.divisions.push(division);
    current.senior ||= senior;
    byId.set(id, current);
  }
  return [...byId.values()];
}

function parseCaeForeign(html) {
  const records = [];
  const rowPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
  for (const rowMatch of html.matchAll(rowPattern)) {
    const cells = [...rowMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((match) => decodeHtml(match[1]));
    const link = rowMatch[1].match(/<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>/);
    if (!link || cells.length < 6 || !/^\d+$/.test(cells[0])) continue;
    const name = decodeHtml(link[2]);
    const profileUrl = absolute(link[1], sources.caeForeign);
    const profileId = profileUrl.match(/\/([^/]+)\.html$/)?.[1] || normalizeName(name);
    records.push({
      id: `cae-foreign:${profileId}`,
      name,
      aliases: [name],
      academy: "中国工程院",
      memberType: "外籍院士",
      divisions: [],
      senior: null,
      country: cells[3] || null,
      electionYear: /^\d{4}$/.test(cells[4]) ? Number(cells[4]) : null,
      specialty: cells[5] || null,
      officialProfileUrl: profileUrl,
      officialListUrl: sources.caeForeign,
    });
  }
  return records;
}

const [casDomesticHtml, casForeignHtml, caeDomesticHtml, caeForeignHtml] = await Promise.all([
  fetchText(sources.casDomestic), fetchText(sources.casForeign),
  fetchText(sources.caeDomestic), fetchText(sources.caeForeign),
]);

const records = [
  ...parseCasDomestic(casDomesticHtml),
  ...parseCasForeign(casForeignHtml),
  ...parseCaeDomestic(caeDomesticHtml),
  ...parseCaeForeign(caeForeignHtml),
];

const byName = {};
for (const record of records) {
  for (const alias of record.aliases) {
    const key = normalizeName(alias);
    if (!key) continue;
    byName[key] ||= [];
    if (!byName[key].includes(record.id)) byName[key].push(record.id);
  }
}

const counts = {
  total: records.length,
  casDomestic: records.filter((row) => row.academy === "中国科学院" && row.memberType === "院士").length,
  casForeign: records.filter((row) => row.academy === "中国科学院" && row.memberType === "外籍院士").length,
  caeDomestic: records.filter((row) => row.academy === "中国工程院" && row.memberType === "院士").length,
  caeForeign: records.filter((row) => row.academy === "中国工程院" && row.memberType === "外籍院士").length,
};

for (const [label, count] of Object.entries(counts)) {
  if (count === 0) throw new Error(`Parsed zero records for ${label}`);
}
if (counts.casDomestic < 800 || counts.caeDomestic < 800) {
  throw new Error(`Unexpectedly small domestic lists: ${JSON.stringify(counts)}`);
}

const output = {
  schemaVersion: 1,
  verifiedOn: snapshotDate,
  scope: "中国科学院和中国工程院官网当前在列院士及外籍院士；不含已故名单",
  sources,
  counts,
  matchingPolicy: "姓名命中只是候选；必须再用引用论文机构、研究方向或个人标识完成身份消歧",
  records,
  byName,
};

await fs.mkdir(dataDir, { recursive: true });
const json = `${JSON.stringify(output, null, 2)}\n`;
await Promise.all([fs.writeFile(stablePath, json), fs.writeFile(snapshotPath, json)]);
console.log(JSON.stringify({ stablePath, snapshotPath, counts }, null, 2));
