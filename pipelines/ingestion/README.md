# Ingestion pipeline

Run from the repository root with `python -m pipelines.ingestion.sync`.

The global workflow refreshes ESPN projections, injury designations, ownership, and
rankings every six hours. Its 08:17 UTC run also refreshes raw ESPN,
FantasyPros, and Reddit source documents. A manual run can include the source
scrape with the `include_sources` input.

No AI summaries or sentiment fields are generated or stored. Summaries remain an
inference-time Copilot concern.
