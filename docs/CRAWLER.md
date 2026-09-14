# Crawler

> **Production knowledge builder**  
> `scripts/crawl/index.mjs`  ·  Maintained by **Abhijeet Patil** — `@Religiouskid` · `@Para0x`

The crawler is the controlled build system for the Help Desk knowledge base. It reads the curated source registry, extracts useful documentation, converts it into safe Rich Message HTML and produces deterministic JSON.

## ◇ Safety model

1. Fetch with a bounded timeout and response-size limit.
2. Crawl only sources explicitly enabled in `config/sources.json` with `index: true`.
3. Require at least one extracted item per indexed source.
4. Refuse publication when a populated source suddenly loses more than the configured drop ratio.
5. Validate generated Rich HTML against the supported Telegram renderer tags.
6. Sort output deterministically by item ID.
7. Store source hashes in `data/crawl-state.json` for change tracking.

A failed source aborts the publish step. The existing `data/knowledge.json` therefore remains untouched instead of being replaced by partial data.

## ⟡ Extraction model

### FAQ pages

Explicit `Q:` headings are treated as FAQ questions. Parent headings are retained as section context where useful.

### Guides and terms

Meaningful `h2`–`h6` sections are converted into knowledge entries while navigation, scripts, styles and unrelated page chrome are discarded.

### Rich content

HTML is sanitized into the supported Telegram Rich Message subset while preserving useful structures such as:

- headings
- paragraphs
- ordered and unordered lists
- links
- tables
- code and preformatted blocks
- blockquotes
- collapsible details

## ◈ Adding a source

Edit `config/sources.json`, define the source classification and extraction behavior, then test it locally:

```bash
node scripts/crawl/index.mjs
node scripts/validate-knowledge.mjs
node scripts/validate-rich-knowledge.mjs
```

A source should be added because it improves Help Desk coverage, not simply because another Telegram page exists.

## 🛡 Publishing rule

The crawler is a **build step**, not a live runtime service. GitHub Actions executes it on schedule or manual dispatch; the Vercel function consumes the resulting generated dataset.
