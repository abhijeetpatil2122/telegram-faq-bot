# Telegram Help Desk

A serverless Telegram Help Desk backed by curated official Telegram sources. It searches a versioned knowledge dataset and returns deterministic Rich Messages with official source links.

## ✨ What it does

- 🔎 Inline Help Desk search with deterministic ranking.
- 📚 Official Telegram FAQ, security, Premium, channels, bot and terms coverage.
- 🧩 Rich Messages with headings, lists, code, tables, quotes, details and links.
- 🔗 Official source button on every answer.
- 🛠 Protected admin control center with live knowledge, crawl, storage, health and source diagnostics.
- 🚫 No hallucinated answers: unsupported questions return no official result.
- ⚡ GitHub Actions refreshes knowledge every 6 hours.
- ☁️ Vercel serverless runtime; no database or VPS required.

## 🏗 Architecture

```text
Official Telegram sources
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
api/telegram.js
        ↓
deterministic search + Rich Messages
        ↓
Telegram Help Desk
```

## 📚 Source policy

The bot is source-bound. Official Telegram content is the authority; the bot does not use an LLM to invent answers.

### Indexed user-help sources

- Telegram FAQ
- Telegram Spam FAQ
- Telegram Premium FAQ
- Telegram Channels FAQ

### Indexed bot/developer-help sources

- Bots FAQ
- Bots introduction
- Telegram Bot Features
- Telegram Bot Developer Terms
- Telegram Bot Terms

### Discovery-only sources

The Telegram Blog, Telegram Evolution and the full Bot API reference are tracked for coverage/discovery but are not blindly injected into general Help Desk search. The Bot API is especially technical and should not pollute user-help results.

MarshalX's `telegram-crawler` is used as a coverage/discovery reference, not as a raw dataset. Its large universe contains technical API and MTProto material that is intentionally outside this Help Desk's scope.

## 🔍 Search

The live search engine remains deterministic. It considers question/title matches, phrases, aliases, keywords, sections and token coverage. The knowledge schema adds category, audience, priority and provenance without replacing the existing search contract.

## 🤖 Commands

| Command | Purpose |
| --- | --- |
| `/start` | Open the Help Desk welcome screen. |
| `/help` | Show help and search instructions. |
| `/ping` | Measure Telegram API round-trip latency. |
| `/admin` | Open the protected admin control center. |

`/admin` is available only to Telegram user IDs configured in `ADMIN_IDS`. The admin panel uses Rich Message callback buttons and edits the existing message when navigating, so it does not create chat spam.

Admin controls include Statistics, Crawl Status, Source Diagnostics, Health, Storage and System. `▶️ Run Crawl` queues the GitHub Actions workflow; it does not crawl Telegram from the Vercel runtime.

Inline mode:

```text
@YourBotUsername how do I enable passkeys?
```

## 🔄 Knowledge updates

GitHub Actions runs the crawler every six hours and on manual dispatch.

The crawler:

1. Loads only enabled/indexed sources from configuration.
2. Fetches them with bounded timeout and response size.
3. Extracts FAQ questions and meaningful guide/terms sections.
4. Sanitizes content into the supported Rich Message HTML subset.
5. Refuses empty sources and catastrophic entry-count drops.
6. Generates deterministic, sorted JSON.
7. Validates the result before committing it.

## 📁 Structure

```text
api/
  telegram.js
config/
  sources.json
  categories.json
  crawler.json
  search.json
  rich-message.json
data/
  knowledge.json
  crawl-state.json
scripts/
  crawl/index.mjs
  admin-source-diagnostics.mjs
  search-engine.mjs
  validate-knowledge.mjs
  validate-rich-knowledge.mjs
  tests/
.github/workflows/
  update-faq.yml
docs/
  ARCHITECTURE.md
  SOURCES.md
  CRAWLER.md
  KNOWLEDGE_SCHEMA.md
  SEARCH.md
  RICH_MESSAGES.md
```

## 🧪 Development

Requires Node.js 24.

```bash
npm install
npm run check
npm run runtime:test
npm run validate
npm run search:test
npm run search:engine:test
npm run search:benchmark
```

`npm run crawl` rebuilds the generated knowledge from configured official sources.

## 🔐 Vercel

Required environment variables:

- `BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `ADMIN_IDS` — comma-separated Telegram user IDs allowed to use `/admin`, for example `123456789,987654321`
- `GITHUB_TOKEN` — token used only by the admin `▶️ Run Crawl` control to dispatch the GitHub Actions workflow

The webhook, search and Rich Message implementation run from the Vercel serverless function. The Vercel runtime does not crawl Telegram sources.

## 📜 Scope

This is a Telegram documentation Help Desk, not a general-purpose AI assistant. If official indexed material does not support a question, the correct result is **no official answer**.
