# Telegram FAQ Bot

A serverless Telegram inline knowledge bot backed only by official Telegram documentation, FAQs, guides and terms.

## ✨ Features

- 🔎 Fast inline search with deterministic relevance ranking.
- 📚 Answers sourced only from indexed official Telegram documentation.
- 🧩 Rich Telegram messages with structured formatting and interactive buttons.
- 🔗 Every answer includes a link back to its official source.
- 🚫 No-result handling instead of hallucinating unsupported answers.
- 🏓 `/ping` reports Telegram Bot API round-trip latency in milliseconds.
- 🛠 `/start` and `/help` provide a structured command/help interface.
- ⚡ Fully serverless — no VPS and no database required.

## 🏗 Architecture

```text
Official Telegram documentation
        ↓
GitHub Actions crawler
        ↓
data/knowledge.json
        ↓
Vercel serverless webhook
        ↓
Telegram inline search + commands
```

### Stack

- **Telegram Bot API** — webhook, inline mode and Rich Messages.
- **Vercel** — serverless webhook/API runtime.
- **GitHub Actions** — scheduled knowledge crawler.
- **GitHub** — versioned generated knowledge dataset.
- **Node.js** — crawler and serverless runtime.
- **No database / No VPS** — the repository is the source of truth for indexed knowledge.

## 📚 Official source policy

The bot is deliberately **source-bound**. It does not use an LLM to invent answers.

### Indexed sources

- Telegram FAQ
- Bots FAQ
- Bots: An introduction for developers
- Telegram Bot Features
- Telegram Bot Platform Developer Terms
- Terms of Service for Bots

The crawler extracts explicit FAQ questions and meaningful sections from the official guides and terms, preserving useful structure such as headings, lists, tables, quotes, links and other supported rich formatting.

### Bot API reference

The full Bot API reference is intentionally **not indexed as general FAQ knowledge**. It is primarily a method/type/parameter reference for developers.

The bot can link users to the official Bot API documentation, but unsupported API-reference questions are not fabricated from memory.

## 🔍 Search behavior

Search ranking considers question/title matches, phrases, prefixes, token coverage, aliases, keywords and sections. Results are deterministic so the same indexed knowledge produces stable search ordering.

If the indexed official material does not sufficiently support a query, the bot returns a no-results response rather than making up an answer.

## 🤖 Commands

| Command | Purpose |
| --- | --- |
| `/start` | Open the welcome screen and search controls. |
| `/help` | Show available commands and inline-search guidance. |
| `/ping` | Measure Telegram Bot API round-trip latency in milliseconds. |

### Inline mode

Use the bot from any chat with:

```text
@YourBotUsername your question
```

Ask short, specific questions for the best search results.

## 🔄 Knowledge updates

GitHub Actions runs the crawler every 6 hours and can also be started manually.

The update pipeline:

1. Fetches only the configured official Telegram sources.
2. Extracts FAQ entries and meaningful guide/terms sections.
3. Validates the generated knowledge schema and Rich HTML.
4. Refuses to publish an empty source result.
5. Produces deterministic JSON so timestamps do not create fake changes.
6. Commits `data/knowledge.json` only when the knowledge content actually changes.

This keeps temporary source outages or parser regressions from silently wiping the knowledge base.

## 📁 Repository structure

```text
api/telegram.js                  # Vercel webhook, commands and search
scripts/crawl-faq.mjs            # Official-source crawler/parser
scripts/validate-knowledge.mjs   # Generated-data validator
data/knowledge.json             # Generated indexed knowledge
.github/workflows/update-faq.yml # Scheduled crawler workflow
package.json                     # Node.js dependencies/scripts
```

## 🔐 Deployment configuration

Set these environment variables in Vercel:

- `BOT_TOKEN` — Telegram bot token from @BotFather.
- `TELEGRAM_WEBHOOK_SECRET` — a long random secret used to verify webhook requests.

After deployment:

1. Configure the Telegram webhook to the Vercel `/api/telegram` endpoint using the same secret token.
2. Enable inline mode for the bot through @BotFather.
3. Test `/start`, `/help`, `/ping`, and inline search.

## 🧪 Local checks

```bash
node --check api/telegram.js
node scripts/crawl-faq.mjs
node scripts/validate-knowledge.mjs
```

The project uses Node.js 24 in GitHub Actions.

## 📜 Scope

This project is a Telegram documentation search/help bot, not a general-purpose AI assistant. Every answer is derived from the indexed official Telegram sources and exposes the corresponding source link.

When official indexed material does not cover a question, the correct behavior is to return **no official answer** rather than hallucinate.

## 📄 License

See the repository license file for the project's licensing terms.
