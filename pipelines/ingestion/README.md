# Ingestion pipeline

Run from the repository root with `python -m pipelines.ingestion.sync`.

The global workflow refreshes ESPN projections, injury designations, ownership, and
rankings every six hours. Its 08:17 UTC run also refreshes FantasyPros full-PPR
overall/positional ECR, FFToday full-PPR projections/projected positional ranks,
and raw ESPN, FantasyPros, and Reddit source documents. A manual run can include
the daily sources with the `include_sources` input.

FFToday is fetched once per day using its four public QB/RB/WR/TE projection pages.
Stored rows retain the original URL and source publication date, and the product
credits and links to FFToday. Third-party data is not covered by this repository's
software license. The importer fails closed when the table contract or player-match
coverage changes, preserving the last successful snapshot.

Source enrichment is intentionally limited to the 450 highest-ownership/ranked
players so daily Reddit searches stay within provider limits. Reddit 429 responses
are retried with backoff, and any remaining gaps are recorded on the sync run.

No AI summaries or sentiment fields are generated or stored. Summaries remain an
inference-time Copilot concern.
