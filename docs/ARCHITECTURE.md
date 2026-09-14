# Architecture

> **Telegram Help Desk**  
> A source-bound documentation system maintained by **Abhijeet Patil** — `@Religiouskid` · `@Para0x`

Telegram remains the authority. GitHub stores the generated knowledge, GitHub Actions builds and validates it, and Vercel serves the Telegram runtime.

## ◇ System flow

```text
                  OFFICIAL TELEGRAM SOURCES
                              │
                              ▼
                    config/sources.json
                              │
                              ▼
                  scripts/crawl/index.mjs
                              │
                 fetch → extract → sanitize
                 normalize → safety checks
                              │
                              ▼
                    data/knowledge.json
                              │
                              ▼
                 validation + search tests
                              │
                              ▼
                    Vercel /api/telegram.js
                              │
                    deterministic search
                              │
                              ▼
                    Rich Message renderer
                              │
                              ▼
                       TELEGRAM BOT
```

## ◈ Runtime boundaries

### GitHub Actions owns

- scheduled and manual crawls
- official-source fetching
- extraction and normalization
- generated knowledge
- schema/Rich HTML validation
- search regression and benchmark checks
- committing validated dataset changes

### Vercel owns

- Telegram webhook handling
- inline search
- commands and admin UI
- deterministic result ranking
- Rich Message rendering
- serving the generated knowledge dataset
- dispatching a GitHub Actions crawl when an admin explicitly requests one

**Vercel never crawls Telegram sources.**

## ⟡ Design rules

1. **Never fabricate an official answer.**
2. **Never publish an empty or catastrophically reduced source.**
3. **Keep the official source attached to every knowledge item.**
4. **Keep canonical Rich Message HTML in the knowledge layer.**
5. **Keep discovery-only material separate from indexed Help Desk content.**
6. **Prefer deterministic output so scheduled runs publish only real changes.**
7. **Keep the last known-good dataset when a crawl fails.**

## ◇ Why the separation matters

The generated knowledge base is treated as a versioned build artifact rather than a database that the live bot modifies. This keeps the runtime lightweight while making knowledge changes reviewable, reproducible and recoverable through Git history.
