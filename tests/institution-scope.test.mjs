import assert from "node:assert/strict";
import test from "node:test";

import { hasStrictPriorityAffiliation, isStrictPriorityInstitution } from "../scripts/lib/institution-scope.mjs";

const cache = {
  institutions: {
    "985 University": { classifications: ["985", "211", "双一流"], qsRank: null },
    "211 University": { classifications: ["211", "双一流"], qsRank: null },
    "Double First Class Only": { classifications: ["双一流"], qsRank: null },
    "QS University": { classifications: [], qsRank: "=174" },
    "Other University": { classifications: [], qsRank: null },
  },
};

test("priority institution scope includes 985, 211, Double First Class, or QS top 200", () => {
  assert.equal(isStrictPriorityInstitution(cache.institutions["985 University"]), true);
  assert.equal(isStrictPriorityInstitution(cache.institutions["211 University"]), true);
  assert.equal(isStrictPriorityInstitution(cache.institutions["QS University"]), true);
  assert.equal(isStrictPriorityInstitution(cache.institutions["Double First Class Only"]), true);
  assert.equal(isStrictPriorityInstitution(cache.institutions["Other University"]), false);
});

test("an author qualifies when at least one paper affiliation is in scope", () => {
  assert.equal(hasStrictPriorityAffiliation({ paperAffiliations: ["Other University", "QS University"] }, cache), true);
  assert.equal(hasStrictPriorityAffiliation({ paperAffiliations: ["Double First Class Only"] }, cache), true);
});

test("publisher article affiliations override aggregator fallback affiliations", () => {
  const author = {
    articleAffiliations: ["Other University"],
    paperAffiliations: ["QS University"],
    affiliationEvidence: { sourceType: "publisher_pdf", sourceUrl: "https://example.org/paper.pdf" },
  };
  assert.equal(hasStrictPriorityAffiliation(author, cache), false);
});
