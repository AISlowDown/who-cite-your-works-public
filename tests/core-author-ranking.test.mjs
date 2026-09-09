import test from "node:test";
import assert from "node:assert/strict";

import { selectCoreAuthors } from "../scripts/core-author-ranking.mjs";

const records = [
  {
    userWork: { title: "Tracked paper A" },
    citingWork: { title: "Citing paper 1" },
    noteworthyAuthors: [
      { name: "First Author", openalexId: "A1", position: 1, corresponding: false, citedByCount: 5000, hIndex: 30 },
      { name: "Team Star", openalexId: "A2", position: 2, corresponding: false, citedByCount: 9000, hIndex: 40 },
      { name: "Corresponding Author", openalexId: "A3", position: 3, corresponding: true, citedByCount: 4000, hIndex: 25 },
      { name: "At Threshold", openalexId: "A4", position: 1, corresponding: false, citedByCount: 2000, hIndex: 20 },
    ],
  },
  {
    userWork: { title: "Tracked paper B" },
    citingWork: { title: "Citing paper 2" },
    noteworthyAuthors: [
      { name: "First Author", openalexId: "A1", position: 2, corresponding: true, citedByCount: 5100, hIndex: 31 },
    ],
  },
];

test("keeps only authors who are first or corresponding and strictly exceed the citation threshold", () => {
  const result = selectCoreAuthors(records, { threshold: 2000, limit: 100 });
  assert.deepEqual(result.map((author) => author.openalexId), ["A1", "A3"]);
});

test("deduplicates authors, aggregates role counts, and sorts by total citations descending", () => {
  const result = selectCoreAuthors(records, { threshold: 2000, limit: 100 });
  assert.equal(result[0].name, "First Author");
  assert.equal(result[0].citedByCount, 5100);
  assert.equal(result[0].firstAuthorScenarios, 1);
  assert.equal(result[0].correspondingAuthorScenarios, 1);
  assert.equal(result[0].scenarioCount, 2);
});

test("applies the requested top-N limit after ranking", () => {
  const result = selectCoreAuthors(records, { threshold: 2000, limit: 1 });
  assert.equal(result.length, 1);
  assert.equal(result[0].rank, 1);
  assert.equal(result[0].openalexId, "A1");
});

test("applies an institution predicate before ranking and limiting", () => {
  const result = selectCoreAuthors(records, {
    threshold: 2000,
    limit: 100,
    includeAuthor: (author) => author.openalexId === "A3",
  });
  assert.deepEqual(result.map((author) => author.openalexId), ["A3"]);
  assert.equal(result[0].rank, 1);
});

test("stores citing-article affiliation provenance and prefers it over fallback data", () => {
  const direct = structuredClone(records);
  direct[0].noteworthyAuthors[0].articleAffiliations = ["Publisher University"];
  direct[0].noteworthyAuthors[0].paperAffiliations = ["Aggregator University"];
  direct[0].noteworthyAuthors[0].affiliationEvidence = {
    sourceType: "publisher_html",
    sourceUrl: "https://example.org/citing-paper",
  };
  const author = selectCoreAuthors(direct).find((item) => item.openalexId === "A1");
  assert.deepEqual(author.paperAffiliations, ["Publisher University"]);
  assert.deepEqual(author.affiliationEvidenceSources, ["openalex_authorship_fallback", "publisher_html"]);
  assert.deepEqual(author.affiliationEvidenceUrls, ["A1", "https://example.org/citing-paper"]);
});
