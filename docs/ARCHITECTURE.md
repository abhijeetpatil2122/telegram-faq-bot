# Architecture

Telegram Help Desk is a source-bound documentation system. Telegram remains the authority; GitHub stores the generated knowledge; Vercel serves search and Telegram updates.

```text
Official Telegram sources
        │
        ├── configured direct sources
        └── discovery-only sources / crawler maps
        ↓
config/sources.json
        ↓
scripts/crawl/index.mjs
        ↓
safety + extraction + normalization
        ↓
data/knowledge.json
        ↓
scripts/validate-knowledge.mjs
        ↓
Vercel /api/telegram.js
        ↓
deterministic search → Rich Message renderer → Telegram
```

## Design rules

- Never fabricate an official answer.
- Never publish an empty or catastrophically reduced source.
- Keep source URLs attached to every knowledge item.
- Keep Rich Message HTML in the knowledge layer so Telegram presentation can remain structured.
- Keep discovery sources separate from indexed sources.
- Prefer deterministic output so scheduled crawls only commit real knowledge changes.
