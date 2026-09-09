# Fellow Membership Cache Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and connect the first official-source cache for IEEE, AAAS, IWA, ASCE, AIChE, ACS, and RSC Fellow memberships, while requiring name plus affiliation/career evidence before a membership is displayed as a confirmed author honor.

**Architecture:** A source registry describes each society's official domains, grades, access mode, and coverage. Independent source adapters emit one normalized record shape into a merge-safe cache pipeline that preserves historical annual records and retains the previous stable cache when a source fails. Lookup commands share one identity-confirmation module with the Chinese academician lookup; only confirmed same-affiliation or documented-affiliation-change states flow into author-profile honors, while candidates and conflicts remain in evidence JSON.

**Tech Stack:** Node.js ES modules and built-in `fetch`, `node:test`, JSON caches and fixtures, official HTML/PDF/XLSX sources, existing who-cite-your-works scripts.

**Spec:** `docs/superpowers/specs/2026-09-02-fellow-membership-cache-design.md`

## Global Constraints

- Use only organization-owned official domains or organization-published files for membership assertions. University pages and ORCID may disambiguate a person or prove a career move, but must not create a society membership record by themselves.
- Preserve existing user changes in the dirty worktree. Stage and commit only the files named in the current task.
- Do not label ordinary Member, Senior Member, Research Fellow, Postdoctoral Fellow, Visiting Fellow, editorial-board service, or paid membership as an elected/recognized Fellow honor.
- A name match is candidate recall only. Only `verified_same_affiliation` and `verified_affiliation_change` may be copied into the report-facing Honor field.
- A source failure, zero-row parse, implausibly small parse, 403, rate limit, or schema change must retain that organization's last stable records.
- An annual list adds records and never deletes or overwrites earlier election years. A public current directory may mark records unobserved but may not delete them without formal withdrawal evidence.
- `not_found_in_covered_cache` describes local coverage only and must never be rendered as “不是 Fellow”.
- Network refreshes are explicit smoke tests. Automated tests use small checked-in fixtures derived from official source structures, so the suite remains deterministic.
- Keep internal confirmation states and evidence details in JSON. The user-facing XLSX/Markdown Honor cell contains only verified honors, separated with ` • `.

---

### Task 1: Define the source registry and normalized record contract

**Files:**
- Create: `data/fellow-source-registry.json`
- Create: `scripts/lib/fellow-cache.mjs`
- Create: `tests/fellow-cache.test.mjs`

**Official sources to register:**
- Royal Society: `https://royalsociety.org/fellows-directory/`
- IEEE: `https://www.ieee.org/membership/fellows/fellows-directory.html`
- AAAS: `https://www.aaas.org/fellows/listing`
- IWA: `https://www.iwa-network.org/iwa-fellows`
- ASCE: `https://www.asce.org/membership/join/fellow` and `https://www.asce.org/about-asce/official-register`
- AIChE: `https://www.aiche.org/community/sites/fellows` and `https://www.aiche.org/community/sites/fellows/menu/fellows-directory`
- ACS: `https://www.acs.org/funding/awards/acs-fellows/fellows.html`
- RSC: `https://www.rsc.org/membership/membership-categories/fellow`

- [x] **Step 1: Write the failing schema and merge tests**

Add tests that import `validateFellowRecord`, `mergeFellowRecords`, `buildFellowIndexes`, and `validateOfficialUrl`. Assert that a valid record contains:

```js
{
  id: "acs:2025:frances-h-arnold",
  name: "Frances H. Arnold",
  aliases: ["Frances H. Arnold"],
  organizationId: "acs",
  organization: "American Chemical Society",
  membershipGrade: "ACS Fellow",
  membershipGradeZh: "美国化学会会士",
  electionYear: 2025,
  listedAffiliations: ["California Institute of Technology"],
  status: "elected",
  sourceMode: "official-annual",
  coverage: "official-annual-2009-present",
  officialProfileUrl: null,
  officialListUrl: "https://www.acs.org/funding/awards/acs-fellows/fellows/2025-fellows.html",
  verifiedOn: "2026-09-02"
}
```

Also assert that an ACS URL on a non-ACS domain is rejected, a `Senior Member` grade is rejected, duplicate annual rows merge without losing affiliations, two years remain separate records, and indexes/counts agree with the merged records.

- [x] **Step 2: Run the new test and confirm it fails**

Run: `node --test tests/fellow-cache.test.mjs`

Expected: failure because `scripts/lib/fellow-cache.mjs` does not exist.

- [x] **Step 3: Add the eight-organization source registry**

For every organization, store `organizationId`, display names, allowed official domains, accepted grades, source mode, coverage statement, source URLs, adapter name, minimum safe row count, and `enabled: true`. Use these first-version coverage values:

```text
royal-society = official-current-directory
ieee          = official-public-directory-or-annual
aaas          = official-current-or-annual
iwa           = official-incremental
asce          = official-incremental-or-annual
aiche         = official-historical-and-incremental
acs           = official-annual-2009-present
rsc           = official-incremental
```

Do not claim completeness for IEEE, AAAS, IWA, ASCE, AIChE, or RSC unless the parser has actually captured an official complete public directory.

- [x] **Step 4: Implement normalization, validation, merge, and index helpers**

Export:

```js
normalizePersonName(value)
normalizeAffiliation(value)
validateOfficialUrl(url, sourceConfig)
validateFellowRecord(record, sourceConfig)
mergeFellowRecords(existingRecords, fetchedRecords, organizationId)
buildFellowIndexes(records)
buildFellowCounts(records)
```

Deduplicate by stable `id`; if no official record ID exists, construct the ID from organization, normalized name, grade, and election year. Preserve multiple organizations and multiple grades/years. Return validation errors rather than silently dropping bad rows.

- [x] **Step 5: Run tests and commit**

Run: `node --test tests/fellow-cache.test.mjs`

Expected: all Task 1 tests pass.

Commit:

```bash
git add data/fellow-source-registry.json scripts/lib/fellow-cache.mjs tests/fellow-cache.test.mjs
git commit -m "feat: define Fellow cache source contract"
```

---

### Task 2: Implement affiliation-aware identity confirmation

**Files:**
- Create: `scripts/lib/identity-confirmation.mjs`
- Create: `tests/identity-confirmation.test.mjs`

- [x] **Step 1: Write failing tests for all confirmation states**

Cover these exact outcomes:

1. Same normalized name plus Caltech/California Institute of Technology equivalence returns `verified_same_affiliation`.
2. Same name, paper affiliation at Example Institute, current official profile at Example University, and one official career-history signal linking both institutions plus matching ORCID returns `verified_affiliation_change`.
3. Same name without affiliation evidence returns `candidate_name_only`.
4. Same name with conflicting ORCID or incompatible research field returns `conflict`.
5. No cached candidate returns `not_found_in_covered_cache` and includes the organization's coverage label.
6. A generic token such as `University`, `Institute`, or `Technology` alone cannot confirm an affiliation.
7. A move cannot be confirmed using two non-official signals; at least one signal must have `sourceAuthority: "official"`.

- [x] **Step 2: Run the test and confirm it fails**

Run: `node --test tests/identity-confirmation.test.mjs`

Expected: failure because the module does not exist.

- [x] **Step 3: Implement candidate recall and identity scoring rules**

Export:

```js
findMembershipCandidates({ name, aliases }, cache)
compareAffiliations(left, right, aliasMap)
confirmMembershipIdentity({ author, candidate, identitySignals, coverage })
```

The result must contain `state`, `candidateId`, `matchedAffiliations`, `paperAffiliations`, `currentAffiliations`, `signalsUsed`, `conflicts`, and `coverage`. Treat ORCID mismatch as a hard conflict. Preserve historical and current affiliations separately.

- [x] **Step 4: Add a small institution alias map inside the module**

Support common name variants structurally, including `Caltech`/`California Institute of Technology`, `MIT`/`Massachusetts Institute of Technology`, `HKU`/`The University of Hong Kong`, `HKUST`/`The Hong Kong University of Science and Technology`, and Chinese/English forms already available from the project institution cache. Prefer imported aliases from `data/institution-priority-cache-2026-09-01.json` when present; use the internal map as fallback.

- [x] **Step 5: Run tests and commit**

Run: `node --test tests/identity-confirmation.test.mjs tests/fellow-cache.test.mjs`

Expected: all tests pass.

Commit:

```bash
git add scripts/lib/identity-confirmation.mjs tests/identity-confirmation.test.mjs
git commit -m "feat: confirm memberships with affiliation evidence"
```

---

### Task 3: Refactor the Royal Society refresh into an adapter-safe orchestrator

**Files:**
- Create: `scripts/lib/fellow-sources/http.mjs`
- Create: `scripts/lib/fellow-sources/royal-society.mjs`
- Modify: `scripts/refresh-international-fellows-cache.mjs`
- Create: `tests/fixtures/fellows/royal-society-page.html`
- Create: `tests/fellow-source-adapters.test.mjs`

- [x] **Step 1: Save a minimal Royal Society card fixture and write a failing adapter test**

The fixture must contain two reduced official directory cards with profile links and two different grades. Assert that `parseRoyalSocietyPage` emits normalized records with `organizationId: "royal-society"`, official profile URLs, membership grades, and `sourceMode: "official-directory"`.

- [x] **Step 2: Run the adapter test and confirm it fails**

Run: `node --test tests/fellow-source-adapters.test.mjs`

Expected: failure because the adapter module does not exist.

- [x] **Step 3: Extract shared HTTP behavior and the Royal Society parser**

Move retry, timeout, user-agent, HTML entity decoding, pagination, and parsing out of the top-level refresh script. Export `fetchOfficialText` and `fetchOfficialBuffer`; do not retry 401, 403, captcha, or robots failures. Return a structured source error with URL and HTTP status.

- [x] **Step 4: Convert the refresh script into an orchestrator**

The orchestrator must:

1. Load the source registry and previous stable cache.
2. Run enabled adapters independently.
3. Validate all returned rows and source domains.
4. Reject a source result below its safe minimum.
5. Merge successful sources with historical records.
6. Preserve previous records for failed sources.
7. Atomically write the stable cache and dated snapshot only after global validation.
8. Save per-source `lastAttemptOn`, `lastSuccessOn`, `status`, `recordCount`, and error text in cache metadata.

Add `--source royal-society`, `--fixture <path>`, and `--dry-run` options so behavior can be tested without replacing stable data.

- [x] **Step 5: Test failure retention and run a live dry-run**

Run:

```bash
node --test tests/fellow-source-adapters.test.mjs tests/fellow-cache.test.mjs
node scripts/refresh-international-fellows-cache.mjs --source royal-society --dry-run
```

Expected: tests pass; live dry-run returns more than the registry minimum, and no cache file changes under `--dry-run`.

- [x] **Step 6: Commit**

```bash
git add scripts/lib/fellow-sources/http.mjs scripts/lib/fellow-sources/royal-society.mjs scripts/refresh-international-fellows-cache.mjs tests/fixtures/fellows/royal-society-page.html tests/fellow-source-adapters.test.mjs
git commit -m "refactor: make Fellow refresh source-safe"
```

---

### Task 4: Add ACS full-history annual ingestion

**Files:**
- Create: `scripts/lib/fellow-sources/acs.mjs`
- Create: `tests/fixtures/fellows/acs-fellows.html`
- Create: `tests/fixtures/fellows/acs-fellows.csv`
- Modify: `tests/fellow-source-adapters.test.mjs`

**Official source:** The ACS Fellows Program page links an official “All ACS Fellows” XLSX and annual pages with names and affiliations, beginning in 2009.

- [x] **Step 1: Add failing tests for a complete and an annual ACS source**

Assert that the adapter reads a normalized tabular fixture, retains election year, uses the published affiliation, maps the grade to `ACS Fellow`, and merges a duplicate from an annual HTML page without producing a duplicate record.

- [x] **Step 2: Run the adapter test and confirm the ACS assertions fail**

Run: `node --test tests/fellow-source-adapters.test.mjs`

Expected: missing ACS adapter export.

- [x] **Step 3: Implement the ACS adapter**

Fetch the official all-Fellows spreadsheet when available. Parse `.xlsx` through the bundled spreadsheet runtime if the file is genuinely XLSX; otherwise accept the official annual HTML pages as a deterministic fallback. The adapter output must set `coverage: "official-annual-2009-present"` only when all official years have been observed; otherwise report the exact captured year range.

- [x] **Step 4: Verify with fixtures and a live dry-run**

Run:

```bash
node --test tests/fellow-source-adapters.test.mjs
node scripts/refresh-international-fellows-cache.mjs --source acs --dry-run
```

Expected: fixture tests pass; live output contains multiple election years and non-empty listed affiliations.

- [x] **Step 5: Commit**

```bash
git add scripts/lib/fellow-sources/acs.mjs tests/fixtures/fellows/acs-fellows.html tests/fixtures/fellows/acs-fellows.csv tests/fellow-source-adapters.test.mjs
git commit -m "feat: ingest official ACS Fellows lists"
```

---

### Task 5: Add IWA and ASCE official annual/incremental adapters

**Files:**
- Create: `scripts/lib/fellow-sources/iwa.mjs`
- Create: `scripts/lib/fellow-sources/asce.mjs`
- Create: `tests/fixtures/fellows/iwa-2024.html`
- Create: `tests/fixtures/fellows/asce-fellows.html`
- Modify: `tests/fellow-source-adapters.test.mjs`

- [x] **Step 1: Add failing IWA tests**

Use a reduced fixture from `https://www.iwa-network.org/news/iwa-announces-2024-fellows-and-distinguished-fellows/`. Assert separate `IWA Fellow` and `IWA Distinguished Fellow` grades, election year 2024, and listed organization/country when published.

- [x] **Step 2: Add failing ASCE tests**

Use a reduced official ASCE Fellows/Society News or Official Register fixture. Assert that `ASCE Fellow` and `ASCE Distinguished Member` are accepted but ordinary `ASCE Member` is rejected. Preserve the exact official page URL per record.

- [x] **Step 3: Run and confirm failures**

Run: `node --test tests/fellow-source-adapters.test.mjs`

Expected: missing IWA and ASCE adapter exports.

- [x] **Step 4: Implement both adapters**

The IWA adapter accumulates annual announcements and the official Fellows page. The ASCE adapter accepts only grade-explicit official pages or records; the membership eligibility page may define the grade but cannot itself prove a person's status.

- [x] **Step 5: Verify and commit**

Run:

```bash
node --test tests/fellow-source-adapters.test.mjs
node scripts/refresh-international-fellows-cache.mjs --source iwa --source asce --dry-run
```

Expected: tests pass. If a live page blocks access, the dry-run reports a source failure and preserves prior records rather than returning an empty success.

Commit:

```bash
git add scripts/lib/fellow-sources/iwa.mjs scripts/lib/fellow-sources/asce.mjs tests/fixtures/fellows/iwa-2024.html tests/fixtures/fellows/asce-fellows.html tests/fellow-source-adapters.test.mjs
git commit -m "feat: add IWA and ASCE Fellow sources"
```

---

### Task 6: Add AIChE historical-list plus incremental refresh

**Files:**
- Create: `scripts/lib/fellow-sources/aiche.mjs`
- Create: `tests/fixtures/fellows/aiche-full-list.txt`
- Create: `tests/fixtures/fellows/aiche-new-fellows.html`
- Modify: `tests/fellow-source-adapters.test.mjs`

**Official sources:** AIChE publishes a historical full-list PDF dated 2018, an official Fellows site, a login-protected directory, and newer Fellow announcements/newsletters.

- [x] **Step 1: Add failing historical and incremental tests**

Assert that the historical fixture produces `AIChE Fellow` records with `sourceMode: "official-historical"` and no invented election year. Assert that a newer official announcement adds an elected year and affiliation when published. A directory login page with no names must return `blocked` rather than a zero-row success.

- [x] **Step 2: Run and confirm the tests fail**

Run: `node --test tests/fellow-source-adapters.test.mjs`

Expected: missing AIChE adapter export.

- [x] **Step 3: Implement PDF-text and official-announcement ingestion**

Parse the official historical PDF text using the bundled PDF extraction runtime or a previously extracted checksum-paired text artifact. Store the source document date and `coverage: "official-historical-through-2018-plus-incremental"`. Merge subsequent official newsletters/announcements without treating the login-only current directory as complete public coverage.

- [x] **Step 4: Verify and commit**

Run:

```bash
node --test tests/fellow-source-adapters.test.mjs
node scripts/refresh-international-fellows-cache.mjs --source aiche --dry-run
```

Expected: tests pass; dry-run contains the historical baseline plus any accessible official increments.

Commit:

```bash
git add scripts/lib/fellow-sources/aiche.mjs tests/fixtures/fellows/aiche-full-list.txt tests/fixtures/fellows/aiche-new-fellows.html tests/fellow-source-adapters.test.mjs
git commit -m "feat: cache official AIChE Fellows"
```

---

### Task 7: Add IEEE and AAAS adapters with blocked-source fallbacks

**Files:**
- Create: `scripts/lib/fellow-sources/ieee.mjs`
- Create: `scripts/lib/fellow-sources/aaas.mjs`
- Create: `data/fellow-official-record-manifest.json`
- Create: `tests/fixtures/fellows/ieee-annual.html`
- Create: `tests/fixtures/fellows/aaas-annual.html`
- Modify: `tests/fellow-source-adapters.test.mjs`

- [x] **Step 1: Write failing directory/annual/manifest tests**

Assert that official IEEE annual Fellow records become `IEEE Fellow`; official AAAS annual records become `AAAS Fellow`; a blocked/consent-limited directory is marked partial; and manifest rows are accepted only when their evidence URL belongs to the registered official organization domain.

- [x] **Step 2: Run and confirm failures**

Run: `node --test tests/fellow-source-adapters.test.mjs`

Expected: missing IEEE and AAAS adapters.

- [x] **Step 3: Implement official public parsing and the constrained manifest fallback**

The manifest is not a manual honor assertion. Each row must include exact official evidence URL, organization ID, name, grade, published affiliation if present, election year if present, retrieval date, and a short extraction locator. Validation rejects school news, ORCID, Google Scholar, publisher biographies, and non-official domains as membership evidence.

Use the official public directory/annual source when accessible. When it is blocked, update only from validated official annual pages/PDFs and manifest rows; declare coverage partial.

- [x] **Step 4: Verify and commit**

Run:

```bash
node --test tests/fellow-source-adapters.test.mjs tests/fellow-cache.test.mjs
node scripts/refresh-international-fellows-cache.mjs --source ieee --source aaas --dry-run
```

Expected: tests pass; live outcome is either non-zero official records or an explicit partial/blocked status with old-cache retention.

Commit:

```bash
git add scripts/lib/fellow-sources/ieee.mjs scripts/lib/fellow-sources/aaas.mjs data/fellow-official-record-manifest.json tests/fixtures/fellows/ieee-annual.html tests/fixtures/fellows/aaas-annual.html tests/fellow-source-adapters.test.mjs
git commit -m "feat: add IEEE and AAAS Fellow sources"
```

---

### Task 8: Add RSC official incremental verification

**Files:**
- Create: `scripts/lib/fellow-sources/rsc.mjs`
- Create: `tests/fixtures/fellows/rsc-official-profile.html`
- Modify: `data/fellow-official-record-manifest.json`
- Modify: `tests/fellow-source-adapters.test.mjs`

**Coverage boundary:** FRSC is the RSC's highest professional membership category, but the public category page is not a person directory. First-version person records must therefore come from official RSC person pages, prize pages, announcements, or other RSC-owned pages that explicitly identify the named person as FRSC.

- [x] **Step 1: Add failing positive and negative tests**

The positive fixture explicitly names a person as `Fellow of the Royal Society of Chemistry` or `FRSC`. Negative fixtures containing only `Member`, `Research Fellow`, prize winner, editorial board member, or application eligibility must not create a record.

- [x] **Step 2: Run and confirm failure**

Run: `node --test tests/fellow-source-adapters.test.mjs`

Expected: missing RSC adapter export.

- [x] **Step 3: Implement official-page incremental extraction**

Emit `organizationId: "rsc"`, `membershipGrade: "FRSC"`, and `coverage: "official-incremental"`. Add only manifest/profile rows with an explicit membership phrase; never scrape search-result snippets as final evidence.

- [x] **Step 4: Verify and commit**

Run:

```bash
node --test tests/fellow-source-adapters.test.mjs
node scripts/refresh-international-fellows-cache.mjs --source rsc --dry-run
```

Expected: tests pass and the dry-run clearly reports incremental coverage.

Commit:

```bash
git add scripts/lib/fellow-sources/rsc.mjs tests/fixtures/fellows/rsc-official-profile.html data/fellow-official-record-manifest.json tests/fellow-source-adapters.test.mjs
git commit -m "feat: verify official RSC Fellow records"
```

---

### Task 9: Upgrade Fellow and academician lookup commands

**Files:**
- Modify: `scripts/lookup-fellow.mjs`
- Modify: `scripts/lookup-academician.mjs`
- Create: `tests/membership-lookup-cli.test.mjs`

- [x] **Step 1: Write failing CLI tests**

Use temporary fixture caches and execute:

```bash
node scripts/lookup-fellow.mjs "Frances H. Arnold" --affiliation "Caltech"
node scripts/lookup-fellow.mjs "Example Mover" --affiliation "Example Institute" --current-affiliation "Example University" --orcid "0000-0000-0000-0001"
node scripts/lookup-academician.mjs "同名示例" --affiliation "引用论文机构"
```

Assert structured JSON includes `query`, `candidates`, `confirmationState`, `coverage`, and `displayHonors`. Only verified states populate `displayHonors`; candidates/conflicts retain evidence but return an empty display list.

- [x] **Step 2: Run and confirm the tests fail**

Run: `node --test tests/membership-lookup-cli.test.mjs`

Expected: current commands reject or misparse the new options.

- [x] **Step 3: Add an argument parser and shared confirmation call**

Support:

```text
--affiliation <paper-time institution>       repeatable
--current-affiliation <current institution>  repeatable
--orcid <ORCID>
--research <keywords>
--identity-evidence <JSON file>
--cache <JSON file>                          test/debug override
```

Keep backward-compatible name-only output, but label all name-only matches `candidate_name_only`. Return the source coverage statement when no candidate is found.

- [x] **Step 4: Run tests and commit**

Run: `node --test tests/membership-lookup-cli.test.mjs tests/identity-confirmation.test.mjs`

Expected: all tests pass.

Commit:

```bash
git add scripts/lookup-fellow.mjs scripts/lookup-academician.mjs tests/membership-lookup-cli.test.mjs
git commit -m "feat: double-confirm academic honors in lookups"
```

---

### Task 10: Connect verified memberships to author-profile enrichment

**Files:**
- Create: `scripts/lib/membership-profile-enrichment.mjs`
- Modify: `scripts/enrich-target-author-profiles.mjs`
- Modify: `scripts/lib/author-profile-display.mjs`
- Create: `tests/membership-profile-enrichment.test.mjs`
- Modify: `tests/author-profile-display.test.mjs`

- [x] **Step 1: Write failing enrichment tests**

Assert:

1. A verified Chinese academician plus two verified society Fellow records become one display Honor string separated by ` • `.
2. A normal documented affiliation move is retained as verified and preserves both historical and current institutions in evidence JSON.
3. `candidate_name_only`, `conflict`, and `not_found_in_covered_cache` never enter the display Honor string.
4. Multiple memberships are not overwritten by an existing talent title.
5. Existing user-entered or officially verified honors remain intact and deduplicated.

- [x] **Step 2: Run and confirm failure**

Run: `node --test tests/membership-profile-enrichment.test.mjs tests/author-profile-display.test.mjs`

Expected: missing enrichment module or missing verified membership output.

- [x] **Step 3: Implement membership enrichment**

Export:

```js
enrichProfileMemberships({ author, paperAffiliations, currentAffiliations, identitySignals, caches })
verifiedMembershipHonor(result)
```

Save detailed results under `profileVerification.membershipEvidence`. Add verified Chinese academician titles to `academician` and verified international memberships to `otherHonors`; use exact Chinese grade names from the cache. Do not copy ORCID self-asserted memberships directly into the official cache or verified Honor field.

- [x] **Step 4: Integrate with the target author pipeline**

After publisher-paper affiliation extraction and before workbook/text rendering, query both caches for every in-scope author. Feed paper-time affiliation, current official affiliation, ORCID, and official career signals into the confirmation module. If no signal is sufficient, preserve the unresolved candidate only in JSON.

- [x] **Step 5: Run tests and commit**

Run:

```bash
node --test tests/membership-profile-enrichment.test.mjs tests/author-profile-display.test.mjs tests/author-profile-schema.test.mjs
```

Expected: all tests pass and existing title/talent fields remain unchanged.

Commit:

```bash
git add scripts/lib/membership-profile-enrichment.mjs scripts/enrich-target-author-profiles.mjs scripts/lib/author-profile-display.mjs tests/membership-profile-enrichment.test.mjs tests/author-profile-display.test.mjs
git commit -m "feat: add verified memberships to author profiles"
```

---

### Task 11: Document the cache policy and update the skill workflow

**Files:**
- Modify: `references/international-fellows-cache.md`
- Modify: `references/chinese-academicians-cache.md`
- Modify: `references/author-title-honors-policy.md`
- Modify: `SKILL.md`
- Create: `tests/skill-membership-policy.test.mjs`

- [x] **Step 1: Write a failing policy-presence test**

Assert that the documentation and skill contain every organization ID, the five confirmation states, the affiliation-change rule, old-cache retention, partial-coverage wording, and the display rule that only two verified states enter Honor.

- [x] **Step 2: Run and confirm the test fails**

Run: `node --test tests/skill-membership-policy.test.mjs`

Expected: current documents do not yet contain the full first-version policy.

- [x] **Step 3: Update references and SKILL.md**

Document exact refresh and lookup commands, official source URLs, source coverage, last successful refresh, cache record counts, and failure meanings. Add the required lookup order:

1. Read cached author/paper affiliation evidence.
2. Query Chinese academician and international Fellow caches.
3. Confirm same affiliation or documented move.
4. Use official web lookup only for missing/partial coverage or stale evidence.
5. Save newly verified official records to the incremental manifest/cache on the next refresh.
6. Render only verified honors.

State explicitly that RSC and similar professional Fellowship grades may be valuable but are not equivalent to a national academy membership; preserve exact grade labels rather than flattening them to “院士”.

- [x] **Step 4: Run tests and commit**

Run: `node --test tests/skill-membership-policy.test.mjs`

Expected: pass.

Commit:

```bash
git add references/international-fellows-cache.md references/chinese-academicians-cache.md references/author-title-honors-policy.md SKILL.md tests/skill-membership-policy.test.mjs
git commit -m "docs: add official Fellow verification workflow"
```

---

### Task 12: Refresh the first-version cache and verify end to end

**Files:**
- Modify: `data/international-fellows-cache.json`
- Create: `data/international-fellows-cache-2026-09-02.json`
- Modify: `data/fellow-source-registry.json`
- Modify: `data/fellow-official-record-manifest.json`
- Create: `reports/2026-09-02/fellow-cache-refresh-summary.json`
- Create: `reports/2026-09-02/fellow-cache-refresh-summary.md`

- [x] **Step 1: Run the complete deterministic test suite**

Run:

```bash
node --test tests/*.test.mjs
```

Expected: all existing and new tests pass with zero failures.

- [x] **Step 2: Run the complete official-source refresh**

Run:

```bash
node scripts/refresh-international-fellows-cache.mjs
```

Expected: Royal Society and every accessible source update successfully; inaccessible sources retain old records and report `blocked` or `failed-retained`, never an empty successful refresh.

- [x] **Step 3: Validate cache invariants**

Run:

```bash
node scripts/refresh-international-fellows-cache.mjs --validate data/international-fellows-cache.json
```

Expected:

- Every enabled organization has a registry entry and at least one official-source record or an explicit blocked/partial status.
- Every record URL belongs to that organization's registered official domains.
- Records, name index, organization counts, grade counts, and snapshot counts agree.
- Royal Society remains above its established safe minimum.
- ACS contains multiple annual classes.
- No excluded generic membership/job grade appears.

- [x] **Step 4: Run positive, move, conflict, and no-hit lookup checks**

Run at least four concrete CLI queries against the refreshed cache: one same-affiliation match, one documented career move, one common-name conflict, and one absent name. Inspect the JSON to confirm that only the first two produce `displayHonors`.

- [x] **Step 5: Generate the refresh summary**

The JSON/Markdown summary must list per organization: source mode, exact official URLs, prior count, new count, retained count, years covered, last attempt, last success, status, and any access limitation. Do not claim full coverage for partial sources.

- [x] **Step 6: Re-run tests after generated-data changes**

Run: `node --test tests/*.test.mjs`

Expected: zero failures.

- [x] **Step 7: Commit only first-version cache artifacts**

```bash
git add data/international-fellows-cache.json data/international-fellows-cache-2026-09-02.json data/fellow-source-registry.json data/fellow-official-record-manifest.json reports/2026-09-02/fellow-cache-refresh-summary.json reports/2026-09-02/fellow-cache-refresh-summary.md
git commit -m "data: publish first official Fellow cache"
```

- [x] **Step 8: Inspect final git state without touching unrelated changes**

Run:

```bash
git status --short
git log --oneline -12
```

Expected: implementation commits are visible; any unrelated pre-existing modifications remain unstaged and unchanged.
