# Knowledge Schema

Current generated schema is version 3.

```json
{
  "schemaVersion": 3,
  "generatedAt": "...",
  "generator": "scripts/crawl/index.mjs",
  "sources": [],
  "items": []
}
```

Each item contains:

- stable `id`
- `type`
- `category`
- `title` and `question`
- optional `section`
- `aliases`
- `keywords`
- plain `answer`
- Telegram-compatible `answer_html`
- official `source`
- provenance `metadata`

The `answer_html` field is intentionally canonical content, not arbitrary HTML. The validator rejects unsupported tags.
