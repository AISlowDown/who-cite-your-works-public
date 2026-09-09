# Who Cite Your Works Skill — Design

Date: 2026-08-31  
Status: User-approved design pending written-spec review  
Target: Personal Codex skill with optional weekly monitoring

## 1. Purpose

Build a reusable `who-cite-your-works` skill that checks who has cited a target researcher's papers, identifies high-value citing authors and institutions, retrieves the citation context when legally and technically available, and explains in Chinese why the citing paper referenced the target work.

The system must preserve the distinction between a confirmed citation, an influential citer, a prestigious institution, and an interpretable citation context. Missing data must never be converted into a negative finding.

## 2. Confirmed Product Decisions

- Support both on-demand checks and optional weekly monitoring.
- Before a new search, explicitly confirm two independent scopes unless the current request already states them: (1) first/corresponding authors only versus every citing-paper author; and (2) mainland 985/211/second-round Double First Class plus QS top-200 institutions only versus all institutions. Record both choices in the report. Persist them for a recurring monitor only when configuring that monitor.
- Build the user's paper baseline by merging the confirmed records in `wiki-data.js` with candidates discovered through a manual or browser-assisted review of the user's public Google Scholar profile.
- Treat the website list as confirmed. Newly discovered or conflicting Scholar records enter a review queue and do not silently modify `wiki-data.js`.
- Use OpenAlex as the primary structured citation source and Semantic Scholar as a complementary source for citation records, author metrics, and available citation contexts.
- Do not automate bulk scraping of Google Scholar. Scholar is used for manually reviewed baseline candidates, verification links, and its official citation-alert workflow. Scheduled runs must not depend on Scholar availability.
- An influential author must have total citations strictly greater than 2,000. Exactly 2,000 does not pass the threshold.
- When all authors are included, distinguish first/corresponding authors from other co-authors; when the restricted author scope is selected, ordinary co-authors are excluded from the main result.
- Flag citations from mainland 985/211/second-round Double First Class institutions and institutions ranked in the current QS World University Rankings top 200.
- Support a user-maintained watchlist of industry experts. A watchlist match is important even when public citation metrics are missing.
- For important citations, show a short source excerpt, its location when available, a Chinese explanation, a usage category, and confidence.
- When citation context cannot be obtained, report the confirmed citation but do not infer why the work was cited.

## 3. Scope

### 3.1 First release

- Standalone Codex skill installed in the user's personal skills directory.
- Deterministic scripts for record matching, source retrieval, classification inputs, state comparison, and report generation.
- Human-readable Markdown report and machine-readable JSON output.
- Persistent state for detecting newly observed citations.
- Optional weekly Codex automation after the manual workflow has been validated.
- Configurable author threshold, institution lists, QS edition, and expert watchlist.

### 3.2 Deferred work

- Publishing citation results directly on the personal website.
- Automatic modification of the site's paper library.
- Paid or institution-authenticated publisher crawling.
- Treating a citation as positive merely because it exists.
- Assigning a single opaque influence score that hides the evidence categories.

## 4. Architecture

### 4.1 Paper baseline

Inputs:

1. Confirmed paper objects from the project's `wiki-data.js`.
2. A dated, manually reviewed snapshot of the user's public Google Scholar profile for discovery and cross-checking.
3. Optional manual overrides for DOI, OpenAlex work ID, and Semantic Scholar paper ID.

Matching order:

1. Normalized DOI exact match.
2. Trusted database identifier match.
3. Normalized title plus compatible author and year evidence.
4. Otherwise, create a review candidate.

Every baseline record keeps its original source values, normalized values, match method, match confidence, and review state.

### 4.2 Citation acquisition

- OpenAlex supplies the primary work graph, citing works, author identities, and affiliations.
- Semantic Scholar supplements citing works, author `citationCount` and `hIndex`, and citation `contexts`, `intents`, and `isInfluential` where available.
- Source results are merged by DOI first, then trusted IDs, then conservative bibliographic matching.
- Each field retains its source and retrieval timestamp. Conflicts remain visible rather than being silently overwritten.

### 4.3 Author and institution resolution

Author resolution uses, in descending order of confidence:

1. ORCID.
2. OpenAlex or Semantic Scholar author ID.
3. Name, affiliation, co-author network, and publication history.
4. Name only, marked for manual review.

Institution resolution preserves the affiliation printed on the citing paper when obtainable. A normalized institution alias table maps that value to:

- historical 985/211 membership and second-round Double First Class membership;
- the configured annual QS top-200 snapshot;
- canonical institution identifiers and alternative names.

The report must state the QS edition used. An older edition must not be presented as the current ranking.

The 985/211 mapping is a versioned historical classification snapshot with its own provenance. The current Ministry of Education national university list may validate canonical school names, but it is not used by itself as evidence of 985/211 membership.

### 4.4 Expert watchlist

The watchlist is an independent configuration file. Suggested schema:

```yaml
- name: Expert name
  orcid: optional
  openalex_id: optional
  semantic_scholar_id: optional
  institutions:
    - Common affiliation
  aliases:
    - Name variant
  note: Why this expert matters
```

Identifier matches are high confidence. Name-only matches require corroborating affiliation or publication evidence; otherwise they are reported as pending verification.

## 5. Classification Rules

A citing paper may receive multiple labels.

Before applying these labels, apply the user-confirmed scope filters:

- `author_scope: first_corresponding` retains only first and corresponding authors; `author_scope: all` retains every citing-paper author and preserves each role.
- `institution_scope: priority_only` retains citations associated with mainland 985/211/second-round Double First Class institutions or Hong Kong, Macao, Taiwan, and overseas QS top-200 institutions; `institution_scope: all` retains every institution and uses those memberships only as labels.

### P0 — Priority citation

- A user-watchlisted expert is a verified author; or
- the citing paper's first or corresponding author has total citations greater than 2,000.

### P1 — High-value citation

- Another co-author has total citations greater than 2,000; or
- a citing-paper author is affiliated with a mainland 985/211/second-round Double First Class institution; or
- a citing-paper author is affiliated with an institution in the configured QS top 200.

### P2 — Standard new citation

- The citing relationship is confirmed, but no P0 or P1 rule is met.

### Pending verification

- The cited work, citing work, author identity, author role, affiliation, or institutional classification is materially ambiguous.

If corresponding-author information is unavailable, the system does not invent it. The record may still qualify through first authorship, co-authorship, watchlist, or institution evidence.

## 6. Citation-Context Retrieval and Interpretation

Context retrieval is prioritized as follows:

1. Semantic Scholar-provided citation contexts and intents.
2. Legally accessible structured full text such as publisher HTML/XML or repository text.
3. Legally accessible open PDF discovered through source metadata or an open-access resolver.
4. No context available.

For full-text processing, the system identifies the bibliography entry for the user's paper, resolves the in-text citation marker, and collects only the minimum surrounding text needed to interpret the citation. When obtainable, it records section, page, paragraph, and occurrence number.

Each interpretation contains:

- a short evidence excerpt;
- the exact source and location;
- a concise Chinese explanation of why the user's work was cited;
- one or more usage categories;
- confidence and the reason for that confidence.

Usage categories:

- background or related work;
- adoption of method, data, framework, or result;
- comparison with the user's work;
- evidence supporting a claim;
- limitation, criticism, disagreement, or rebuttal;
- review-style listing;
- indeterminate.

The explanation must be grounded in the extracted context. An abstract alone is insufficient evidence of citation intent. If no context is available, the output is: “引用关系已确认，但引用原因暂不可判定。”

## 7. Data Flow

1. Confirm and record author scope and institution scope if the current request has not already specified them.
2. Load confirmed website papers and any manually approved Scholar discovery candidates.
3. Normalize and resolve the user's works.
4. Retrieve citing works from OpenAlex and Semantic Scholar.
5. Merge and deduplicate citation records.
6. Resolve citing authors, roles, metrics, and affiliations.
7. Apply the confirmed filters, watchlist, citation-threshold, mainland 985/211/second-round Double First Class, and QS top-200 rules.
8. Prioritize P0 and P1 records for citation-context retrieval.
9. Extract evidence and classify citation intent.
10. Compare the current normalized result with the previous state.
11. Generate Markdown, JSON, review queue, and state files.

The weekly path starts at step 1 using the last approved baseline; it does not attempt an automated Scholar refresh. A manual baseline-refresh command can create new Scholar review candidates before a normal run.

## 8. Storage Layout

The personal skill contains reusable instructions and deterministic scripts. Project-specific data stays outside the installed skill in the website workspace:

```text
citation-radar/
  config/
    settings.yaml
    expert-watchlist.yaml
    institution-aliases.yaml
    institution-985-211.yaml
    qs-top-200-2027.yaml
  data/
    approved-papers.json
    scholar-review-candidates.json
    state.json
  reports/
    YYYY-MM-DD-who-cite-your-works.md
    YYYY-MM-DD-who-cite-your-works.json
```

Raw API responses may be cached separately with retrieval timestamps for reproducibility, but API keys and authenticated content must never be committed.

## 9. Report Contract

Every citation entry includes, when available:

- the active author scope and institution scope for the run;
- user's cited paper title, DOI, and source IDs;
- citing paper title, authors, venue, year, DOI, and public full-text link;
- priority and all triggered labels;
- relevant authors, author roles, total citations, h-index, metric source, and retrieval date;
- original and normalized affiliation;
- 985/211/second-round Double First Class status or QS rank and ranking edition;
- watchlist match and user note;
- evidence excerpt and location;
- Chinese explanation and usage category;
- confidence, unresolved issues, and verification links;
- discovery status: newly published citation, historical citation newly discovered, previously seen, or changed metadata.

Weekly reports foreground new P0 and P1 entries and summarize P2 entries. A manual run may show the full current inventory.

## 10. State and Change Detection

The state store uses stable citation-edge keys derived from the resolved user-work ID and citing-work ID. It records first-seen time, last-seen time, source coverage, classification history, and context availability.

The system distinguishes:

- a genuinely new citing work;
- an older citation newly indexed by a source;
- a changed author metric or affiliation;
- newly available citation context;
- a source outage.

An unchanged second run must not repeat a notification.

## 11. Failure and Evidence Policy

- API rate limiting or temporary failure triggers bounded retry and then a partial report.
- A failed or blocked source is labelled unavailable; it is never interpreted as zero citations.
- Missing DOI falls back to conservative title-author-year matching with lower confidence.
- Conflicting records retain both source values and enter the review queue when the conflict affects classification.
- Name ambiguity uses identifiers and scholarly context; name-only matches do not silently confirm a notable expert.
- Affiliation aliases preserve the citing paper's original text.
- Multiple citation occurrences are retained when they express different uses.
- Negative and critical citations are reported accurately.
- Public reports use short necessary excerpts and link back to the source. Semantic Scholar attribution and licensing requirements must be respected if its data is displayed publicly.

## 12. Manual and Weekly Operation

Example manual intents:

- “检查我的论文有没有新增引用。”
- “检查是否有大牛或重点高校引用我的论文。”
- “解释重点作者为什么引用这篇论文。”
- “把某位专家加入观察名单。”

The weekly automation is created only after the manual workflow passes validation. It runs the same deterministic pipeline, compares state, and notifies only when there is a new P0/P1 result, a new unresolved high-priority match, or a failed run requiring attention. Normal no-change runs remain quiet.

The manual baseline-refresh operation may use the public Scholar profile in a user-visible browser session or consume a user-provided reviewed snapshot. It does not crawl result pages in bulk.

## 13. Verification Strategy

Automated fixtures must cover:

- exact DOI matching and DOI normalization;
- title punctuation and capitalization variants;
- duplicate records across sources;
- ambiguous author names;
- a citation count of 2,000 versus 2,001;
- core versus team author classification;
- watchlist matching by identifier and name-only uncertainty;
- Chinese and English institution aliases;
- 985/211/second-round Double First Class and annual QS snapshot matching;
- multiple citation occurrences;
- each citation-intent category;
- absence of full text or context;
- source outage and partial-report behavior;
- first run, unchanged second run, and newly discovered historical citation.

Live smoke tests verify a small set of known DOI records without making the deterministic test suite depend on live APIs.

## 14. Acceptance Criteria

The first release is accepted when:

1. It resolves the confirmed website papers without silently adding Scholar candidates.
2. It produces deduplicated citing-paper records with field-level provenance.
3. It applies the strict greater-than-2,000 rule correctly.
4. It distinguishes core, team, institution, and watchlist evidence.
5. Every explanation of citation intent is linked to a source excerpt and location.
6. It reports indeterminate context instead of guessing.
7. It produces useful partial output when one source fails.
8. It does not repeat unchanged notifications.
9. Its Markdown and JSON reports agree on record counts and labels.
10. A user can add an expert to the watchlist without changing program code.

## 15. Authoritative References

- Google Scholar Search Help: <https://scholar.google.com/intl/en/scholar/help.html>
- Google Scholar citation-alert guidance: <https://scholar.google.com/intl/us/scholar/help.html>
- Semantic Scholar Academic Graph API: <https://api.semanticscholar.org/api-docs>
- Semantic Scholar API license: <https://api.semanticscholar.org/license/>
- OpenAlex documentation: <https://docs.openalex.org/>
- QS World University Rankings 2027: <https://www.topuniversities.com/qs-top-uni-wur>
- Ministry of Education national higher-education list: <https://www.moe.gov.cn/jyb_xxgk/s5743/s5744/202606/t20260618_1441074.html>
- Ministry of Education historical 211 statistics table: <https://www.moe.gov.cn/s78/A16/A16_tjdc/201703/W020170303298684014598.pdf>
