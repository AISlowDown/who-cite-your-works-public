import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import { parseRoyalSocietyPage } from "../scripts/lib/fellow-sources/royal-society.mjs";
import { parseAcsAnnualHtml, parseAcsCsv, parseAcsWorkbookXml } from "../scripts/lib/fellow-sources/acs.mjs";
import { parseIwaAnnualHtml } from "../scripts/lib/fellow-sources/iwa.mjs";
import { parseAsceHtml, parseAsceOfficialRegisterText, parseAsceElevationArticle } from "../scripts/lib/fellow-sources/asce.mjs";
import { parseAicheHistoricalText, parseAicheAnnualHtml, parseAicheRecognitionPage } from "../scripts/lib/fellow-sources/aiche.mjs";
import { parseIeeeAnnualHtml, parseIeeeDirectoryPayload, parseIeeeAnnualText } from "../scripts/lib/fellow-sources/ieee.mjs";
import { parseAaasAnnualHtml, parseAaasProgramText } from "../scripts/lib/fellow-sources/aaas.mjs";
import { parseRscOfficialProfile, parseRscCredentialPage, parseRscHonoraryFellows, parseRscHonoraryEntries } from "../scripts/lib/fellow-sources/rsc.mjs";

const fixture = new URL("./fixtures/fellows/royal-society-page.html", import.meta.url);

test("parses Royal Society official directory cards", async () => {
  const html = await fs.readFile(fixture, "utf8");
  const fellows = parseRoyalSocietyPage(html, "Fellow", "2026-09-02");
  const foreign = parseRoyalSocietyPage(html, "Foreign Member", "2026-09-02");
  assert.equal(fellows.length, 2);
  assert.equal(fellows[0].organizationId, "royal-society");
  assert.equal(fellows[0].membershipGrade, "Fellow");
  assert.match(fellows[0].officialProfileUrl, /^https:\/\/royalsociety\.org\//);
  assert.equal(foreign[0].membershipGrade, "Foreign Member");
  assert.equal(foreign[0].sourceMode, "official-directory");
});

test("accepts explicit RSC FRSC evidence and rejects job-title Fellow text", async () => {
  const html = await fs.readFile(new URL("./fixtures/fellows/rsc-official-profile.html", import.meta.url), "utf8");
  const rows = parseRscOfficialProfile(html, "https://www.rsc.org/people/cynthia-ibeto", "2026-09-02");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Cynthia Ibeto");
  assert.equal(rows[0].membershipGrade, "FRSC");
  assert.equal(rows.some((row) => row.name === "Alex Example"), false);
});

test("parses RSC digital credentials and Honorary Fellow cards", async () => {
  const credential = `<h1>Ada Chemist</h1><div class="organization">University of Oxford</div><p>Credential: CChem FRSC</p>`;
  const honorary = await fs.readFile(new URL("./fixtures/fellows/rsc-honorary.html", import.meta.url), "utf8");
  assert.equal(parseRscCredentialPage(credential, { url: "https://www.rsc.org/people/ada", verifiedOn: "2026-09-02" })[0].membershipGrade, "FRSC");
  const rows = parseRscHonoraryFellows(honorary, { url: "https://www.rsc.org/honorary-fellows", verifiedOn: "2026-09-02" });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].membershipGrade, "Honorary Fellow (HonFRSC)");
  const manifest = JSON.parse(await fs.readFile(new URL("../data/fellow-source-manifests/rsc.json", import.meta.url), "utf8"));
  const listed = parseRscHonoraryEntries(manifest.entries, { url: manifest.sourceUrl, verifiedOn: "2026-09-02" });
  assert.equal(listed.length, 119);
  assert.ok(listed.some((row) => row.name === "David Willetts"));
  assert.ok(listed.some((row) => row.name === "Helen P Sharman"));
});

test("parses IEEE and AAAS official annual grades", async () => {
  const ieeeHtml = await fs.readFile(new URL("./fixtures/fellows/ieee-annual.html", import.meta.url), "utf8");
  const aaasHtml = await fs.readFile(new URL("./fixtures/fellows/aaas-annual.html", import.meta.url), "utf8");
  const ieee = parseIeeeAnnualHtml(ieeeHtml, 2025, "2026-09-02", "https://cn.ieee.org/fellows-2025");
  const aaas = parseAaasAnnualHtml(aaasHtml, 2024, "2026-09-02", "https://www.aaas.org/fellows/2024");
  assert.equal(ieee[0].membershipGrade, "IEEE Fellow");
  assert.equal(aaas[0].membershipGrade, "AAAS Fellow");
  assert.deepEqual(ieee[0].listedAffiliations, ["University of Science and Technology of China"]);
});

test("parses IEEE public directory payload and annual text", () => {
  const payload = { results: [{ preferredName: "Ada Engineer", affiliation: "Tsinghua University",
    elevationYear: 2024, citation: "for contributions to systems engineering", profileUrl: "https://www.ieee.org/ada" }] };
  const directory = parseIeeeDirectoryPayload(payload, { url: "https://www.ieee.org/membership/fellows/fellows-directory.html", verifiedOn: "2026-09-02" });
  assert.equal(directory[0].directoryVisibility, "public-opt-in");
  assert.equal(directory[0].citation, "for contributions to systems engineering");
  const annual = parseIeeeAnnualText("Ada Engineer | Tsinghua University | for contributions to systems engineering", { year: 2024, url: "https://www.ieee.org/2024-fellows", verifiedOn: "2026-09-02" });
  assert.equal(annual[0].electionYear, 2024);
});

test("parses AAAS program text across wrapped affiliations and section headings", async () => {
  const text = await fs.readFile(new URL("./fixtures/fellows/aaas-program.txt", import.meta.url), "utf8");
  const rows = parseAaasProgramText(text, { year: 2020,
    url: "https://www.aaas.org/sites/default/files/2021-02/2020_Fellows-Program.pdf",
    verifiedOn: "2026-09-02" });
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((row) => row.name), ["Roch E. Gaussoin", "Carl Bernacchi", "TJ Higgins"]);
  assert.deepEqual(rows.map((row) => row.listedAffiliations[0]), [
    "University of Nebraska-Lincoln",
    "U.S. Department of Agriculture - Agricultural Research Service",
    "CSIRO Agriculture and Food (Australia)",
  ]);
  assert.equal(rows[0].section, "AGRICULTURE, FOOD, AND RENEWABLE RESOURCES");
  assert.match(rows[2].citation, /^For distinguished contributions/);
});

test("parses AIChE historical names and newer official announcements", async () => {
  const text = await fs.readFile(new URL("./fixtures/fellows/aiche-full-list.txt", import.meta.url), "utf8");
  const html = await fs.readFile(new URL("./fixtures/fellows/aiche-new-fellows.html", import.meta.url), "utf8");
  const historical = parseAicheHistoricalText(text, "2026-09-02");
  const annual = parseAicheAnnualHtml(html, "2026-09-02");
  assert.equal(historical.find((row) => row.name === "Rakesh Agrawal").electionYear, null);
  assert.equal(historical[0].sourceMode, "official-historical");
  assert.equal(annual[0].electionYear, 2025);
  assert.deepEqual(annual[0].listedAffiliations, ["Purdue University"]);
});

test("parses AIChE recognition cards without requiring table markup", () => {
  const html = `<article class="fellow"><h3>Grace Process</h3><p class="affiliation">MIT</p><p>Elected Fellow in 2024</p></article>`;
  const rows = parseAicheRecognitionPage(html, { year: 2024, url: "https://www.aiche.org/2024-fellows", verifiedOn: "2026-09-02" });
  assert.equal(rows[0].name, "Grace Process");
  assert.deepEqual(rows[0].listedAffiliations, ["MIT"]);
});

test("parses IWA Fellow and Distinguished Fellow separately", async () => {
  const html = await fs.readFile(new URL("./fixtures/fellows/iwa-2024.html", import.meta.url), "utf8");
  const rows = parseIwaAnnualHtml(html, 2024, "2026-09-02");
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.name === "Jiangyong Hu").membershipGrade, "IWA Distinguished Fellow");
  assert.deepEqual(rows.find((row) => row.name === "Jiangyong Hu").listedAffiliations,
    ["National University of Singapore"]);
});

test("accepts ASCE Fellow grades but excludes ordinary members", async () => {
  const html = await fs.readFile(new URL("./fixtures/fellows/asce-fellows.html", import.meta.url), "utf8");
  const rows = parseAsceHtml(html, 2026, "2026-09-02", "https://www.asce.org/about-asce/official-register");
  assert.deepEqual(rows.map((row) => row.membershipGrade).sort(), ["ASCE Distinguished Member", "ASCE Fellow"]);
  assert.equal(rows.some((row) => row.name === "Ordinary Person"), false);
});

test("keeps ASCE aggregate count separate from elevation records", () => {
  const evidence = parseAsceOfficialRegisterText("Membership Grades  Fellows 3,846  Members 120,000", { year: 2026,
    url: "https://www.asce.org/-/media/asce/official-register.pdf", verifiedOn: "2026-09-02" });
  assert.equal(evidence.fellowCount, 3846);
  const article = parseAsceElevationArticle(`<h1>Shafei elevated to ASCE Fellow status</h1><p>Behrouz Shafei, professor at Iowa State University, has been named a Fellow by ASCE.</p>`, { year: 2025, url: "https://www.asce.org/shafei-elevated", verifiedOn: "2026-09-02" });
  assert.equal(article[0].name, "Behrouz Shafei");
  assert.deepEqual(article[0].listedAffiliations, ["Iowa State University"]);
});

test("parses and merges ACS annual records with affiliations", async () => {
  const html = await fs.readFile(new URL("./fixtures/fellows/acs-fellows.html", import.meta.url), "utf8");
  const csv = await fs.readFile(new URL("./fixtures/fellows/acs-fellows.csv", import.meta.url), "utf8");
  const annual = parseAcsAnnualHtml(html, 2025, "2026-09-02");
  const tabular = parseAcsCsv(csv, "2026-09-02");
  assert.equal(annual[0].membershipGrade, "ACS Fellow");
  assert.deepEqual(annual[0].listedAffiliations, ["California Institute of Technology"]);
  assert.equal(tabular.find((row) => row.name === "Ada Yonath").electionYear, 2024);
  const shared = "<sst><si><t>Full Name</t></si><si><t>Year</t></si><si><t>Affiliation</t></si><si><t>Test Chemist</t></si><si><t>Test University</t></si></sst>";
  const sheet = "<worksheet><sheetData><row r=\"1\"><c r=\"C1\" t=\"s\"><v>0</v></c><c r=\"D1\" t=\"s\"><v>1</v></c><c r=\"E1\" t=\"s\"><v>2</v></c></row><row r=\"2\"><c r=\"C2\" t=\"s\"><v>3</v></c><c r=\"D2\"><v>2021</v></c><c r=\"E2\" t=\"s\"><v>4</v></c></row></sheetData></worksheet>";
  const workbookRows = parseAcsWorkbookXml(shared, sheet, "2026-09-02", "https://www.acs.org/all.xlsx");
  assert.equal(workbookRows[0].name, "Test Chemist");
  assert.equal(workbookRows[0].electionYear, 2021);
});
