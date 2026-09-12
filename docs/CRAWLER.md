# Crawler

`node scripts/crawl/index.mjs` is the production knowledge builder.

## Safety model

1. Fetch with a bounded timeout and response-size limit.
2. Only crawl sources explicitly enabled in `config/sources.json` with `index: true`.
3. Require at least one extracted item per indexed source.
4. Refuse publication when a previously populated source suddenly loses more than the configured drop ratio.
5. Validate Rich HTML against the supported Telegram renderer tags.
6. Sort output deterministically by item ID.
7. Store source hashes in `data/crawl-state.json` for future change monitoring.

A failed source aborts the whole publish step. The existing `data/knowledge.json` therefore remains untouched rather than being replaced by partial data.

## Extraction

FAQ sources extract explicit `Q:` headings. Guide and terms sources extract meaningful h2-h6 sections. HTML is sanitized to a small Rich Message-compatible subset while preserving links, lists, tables, code, blockquotes and collapsible sections.

## Adding sources

Edit `config/sources.json`, classify the source, test extraction, then run:

```bash
node scripts/crawl/index.mjs
node scripts/validate-knowledge.mjs
```

Do not add the complete Telegram API/MTProto universe to the Help Desk index.
