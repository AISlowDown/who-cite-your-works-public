import assert from "node:assert/strict";
import test from "node:test";
import {
  parseAtseDirectoryPage,
  parseCanadianAcademyDirectoryPage,
  parseNaeDirectoryPage,
  parseRaengDirectoryPage,
} from "../scripts/lib/fellow-sources/engineering-academies.mjs";

const verifiedOn = "2026-09-05";

test("parses Canadian Academy of Engineering names, grades, and listed affiliations", () => {
  const html = `<span id="row"><input id="x_hfListingID" value="11656" />
    <div class="row list-item"><a id="x_hlListing" href="/feeds/directory/directory/action/Listing/value/11656/cid/1498/id/2201/Abdulhai%2c-Baher">Abdulhai, Baher</a>
    <p class="employer"><div>Professor, University of Toronto</div></p>
    <div class="status">Fellowship Type:&nbsp;<a>Fellow</a></div></div></span>`;
  const [row] = parseCanadianAcademyDirectoryPage(html, verifiedOn);
  assert.equal(row.name, "Baher Abdulhai");
  assert.equal(row.organizationId, "cae-canada");
  assert.equal(row.membershipGrade, "Fellow");
  assert.deepEqual(row.listedAffiliations, ["University of Toronto"]);
  assert.equal(row.currentTitle, "Professor");
  assert.match(row.officialProfileUrl, /^https:\/\/widgets\.cae-acg\.ca\//);
});

test("parses Australian Academy directory cards and affiliations", () => {
  const html = `<h4 class="search-listing-header">960 Results</h4>
    <a href="/who-we-are/our-fellows/all-fellows/eva-bezak/" class="reu-m13-fellow-tile card h-100">
      <span>Professor</span><h4 class="fellow-name">Eva Bezak</h4>
      <span class="fellow-postnominal">FTSE</span>
      <span class="fellow-affiliation">The University of South Australia (UniSA)</span>
    </a>
    <a href="/who-we-are/our-fellows/all-fellows/example-profile/" class="reu-m13-fellow-tile card h-100">
      <span>Professor</span><h4 class="fellow-name">Example Profile</h4>
      <span class="fellow-postnominal">AM FAA</span>
      <span class="fellow-affiliation">Example University</span>
    </a>`;
  const parsed = parseAtseDirectoryPage(html, verifiedOn);
  assert.equal(parsed.total, 960);
  assert.equal(parsed.records.length, 2);
  assert.equal(parsed.records[0].organizationId, "atse");
  assert.equal(parsed.records[0].membershipGrade, "Fellow (FTSE)");
  assert.deepEqual(parsed.records[0].listedAffiliations, ["The University of South Australia (UniSA)"]);
  assert.equal(parsed.records[1].membershipGrade, "Fellow (official directory; postnominal omitted)");
});

test("parses Royal Academy of Engineering grades, year, and company", () => {
  const html = `<div>Showing 1-100 of 1725 Fellows</div><article class="member-card">
    <h3>Professor Example Engineer FREng</h3><div class="year" title="Elected in 2024">2024</div>
    <p class="company">Imperial College London</p><a href="/fellows-directory/example-engineer/">Profile</a>
  </article>`;
  const parsed = parseRaengDirectoryPage(html, verifiedOn);
  assert.equal(parsed.total, 1725);
  assert.equal(parsed.records[0].name, "Example Engineer");
  assert.equal(parsed.records[0].membershipGrade, "Fellow (FREng)");
  assert.equal(parsed.records[0].electionYear, 2024);
  assert.deepEqual(parsed.records[0].listedAffiliations, ["Imperial College London"]);
  assert.equal(parsed.records[0].currentTitle, "Professor");
});

test("decodes hexadecimal entities in international directory names", () => {
  const html = `<div>Showing 1-1 of 1 Fellows</div><article class="member-card">
    <h3>Professor Enda O&#x27;Connell FREng</h3><div class="year" title="Elected in 2020">2020</div>
  </article>`;
  assert.equal(parseRaengDirectoryPage(html, verifiedOn).records[0].name, "Enda O'Connell");
});

test("parses US National Academy of Engineering member cards", () => {
  const html = `<div>2,841 members</div><article class="tplPerson" data-objectid="178246">
    <span class="memberType">International Member</span><h3><a href="/178246/Dr-Martin-Abadi">Dr. Martin Abadi</a></h3>
    <div class="jobTitle">Professor</div><div class="organization">Columbia University</div>
    <div class="electionYear">Election Year: 2021</div></article>`;
  const parsed = parseNaeDirectoryPage(html, verifiedOn);
  assert.equal(parsed.total, 2841);
  assert.equal(parsed.records[0].name, "Martin Abadi");
  assert.equal(parsed.records[0].membershipGrade, "International Member");
  assert.equal(parsed.records[0].electionYear, 2021);
  assert.deepEqual(parsed.records[0].listedAffiliations, ["Columbia University"]);
  assert.equal(parsed.records[0].currentTitle, "Professor");
});

test("records explicit emeritus status while keeping age-only Canadian grades eligible", () => {
  const naeHtml = `<div>1 members</div><article class="tplPerson" data-objectid="9">
    <span class="memberType">Emeritus</span><h3><a href="/9/Example">Example Member</a></h3>
    <div class="organization">Example University</div></article>`;
  const [nae] = parseNaeDirectoryPage(naeHtml, verifiedOn).records;
  assert.equal(nae.employmentStatus, "retired");
  assert.match(nae.retirementEvidence, /Emeritus/);

  const canadaHtml = `<input id="x_hfListingID" value="10" />
    <a id="x_hlListing" href="/profile/10">Older, Example</a>
    <p class="employer"><div>Professor, Example University</div></p>
    <div>Fellowship Type: <a>90+</a></div>`;
  const [canada] = parseCanadianAcademyDirectoryPage(canadaHtml, verifiedOn);
  assert.equal(canada.membershipGradeZh, "加拿大工程院90岁以上院士");
  assert.equal(canada.employmentStatus, "not-explicitly-retired");
});
