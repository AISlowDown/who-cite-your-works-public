# Who Cite Your Works

An evidence-grounded Codex skill for monitoring citations to a researcher's papers, identifying influential citing authors and institutions, and explaining citation context when source evidence is available.

Status: initial skill entrypoint and versioned institution-priority cache implemented; citation acquisition code remains under development.

The [targeted citation-context collector](references/citation-retrieval.md) now supports a default goal of 10 distinct authors with verified evidence, ranked backfilling, linked HTML/XML and numbered PDF extraction, paginated Semantic Scholar fallback, and checkpoint/cache preservation. Candidate excerpts and verified reference matches remain separate; source coverage and Chinese interpretation still require review.

## Planned capabilities

- Before each new search, confirm whether to include only first/corresponding authors or every citing-paper author, and whether to restrict results to mainland 985/211/Double First Class plus QS top-200 institutions or include all institutions.
- Merge a confirmed local publication list with manually reviewed Google Scholar candidates.
- Retrieve citing works through OpenAlex and Semantic Scholar.
- Apply the user-confirmed author-role and institution scope while retaining the evidence needed to change the display filter later.
- Rank deduplicated qualifying authors by total citations and verify the top 100. Keep detailed title and talent fields in the evidence cache, while presenting a compact author, institution, title, combined honors, status, and source view for reading.
- Flag verified expert-watchlist matches, mainland 985/211/second-round Double First Class institutions, and the configured QS top 200.
- Preserve short citation-context evidence and explain in Chinese why a paper cited the tracked work.
- Export one Excel workbook with two default views: a citing-author index (one disambiguated author per row) and an own-paper index (one tracked publication per row), pairing citing scholars with their paper affiliations and citing works. Retain unmatched publications, distinguish incomplete searches from no qualifying matches, and preserve detailed evidence in Markdown/JSON. See [the output contract](references/report-indexes.md).
- Support manual checks and optional weekly monitoring without treating source failures as zero citations.

See [the approved design](docs/specs/2026-08-31-who-cite-your-works-design.md).

The runtime institution cache is generated from the versioned snapshot by
`scripts/build-institution-priority-cache.mjs`. Existing cached institutions are
reused without repeating web lookups; only previously unseen institutions need
targeted verification.
