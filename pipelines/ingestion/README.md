# Ingestion pipeline

Run from the repository root with `python -m pipelines.ingestion.sync`.

The global workflow refreshes ESPN projections, injury designations, ownership, and
rankings every six hours. Its 08:17 UTC run also refreshes raw ESPN,
FantasyPros, and Reddit source documents. A manual run can include the source
scrape with the `include_sources` input.

Source enrichment is intentionally limited to the 450 highest-ownership/ranked
players so daily Reddit searches stay within provider limits. Reddit 429 responses
are retried with backoff, and any remaining gaps are recorded on the sync run.

No AI summaries or sentiment fields are generated or stored. Summaries remain an
inference-time Copilot concern.
