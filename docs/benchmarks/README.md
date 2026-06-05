# XueMate Expert Benchmark Data

This folder stores raw benchmark outputs used by the expert-facing architecture documents.

## Files

- `rag-benchmark-2026-05-29.json` — raw Hybrid RAG benchmark output.
- `memory-benchmark-2026-05-29.json` — raw Memory Atom benchmark output.
- `expert-metrics-2026-05-29.json` — consolidated metrics for review decks / reports.

## Regenerate

```bash
npm run --silent bench:rag > docs/benchmarks/rag-benchmark-2026-05-29.json
npm run --silent bench:memory > docs/benchmarks/memory-benchmark-2026-05-29.json
```
