# Telegram FAQ Bot

A serverless Telegram inline FAQ bot backed by official Telegram documentation.

## Architecture

```text
Official Telegram docs
        ↓
GitHub Actions crawler
        ↓
data/faq.json
        ↓
Vercel serverless webhook
        ↓
Telegram inline search
```

- **Telegram** — inline queries and webhook updates.
- **Vercel** — serverless webhook/API runtime.
- **GitHub Actions** — scheduled official-source crawler.
- **GitHub** — versioned FAQ dataset; no database required.
- **No VPS required.**

## Current official sources

- Telegram FAQ
- Telegram Bots FAQ

The bot intentionally does **not** generate general AI answers. Search results must come from the indexed official Telegram FAQ sources and include a link back to the source.

## Repository structure

```text
api/telegram.js              # Vercel webhook + inline search
scripts/crawl-faq.mjs        # Official FAQ crawler/parser
data/faq.json                # Generated, version-controlled dataset
.github/workflows/update-faq.yml
```

## How updates work

GitHub Actions runs the crawler every 6 hours and can also be started manually. The crawler:

1. Fetches the official Telegram FAQ pages.
2. Extracts only headings explicitly marked as `Q:`.
3. Refuses to publish an empty result for a source.
4. Produces deterministic, sorted JSON.
5. Commits `data/faq.json` only when the data actually changes.

This keeps temporary source outages or parser regressions from silently wiping the dataset.

## Vercel environment variables

Set these in the Vercel project:

- `BOT_TOKEN` — Telegram bot token from @BotFather.
- `TELEGRAM_WEBHOOK_SECRET` — a long random secret used to verify webhook requests.

After deployment, configure the Telegram webhook to point to the Vercel `/api/telegram` endpoint and use the same secret token. Enable inline mode for the bot through @BotFather.

## Local checks

```bash
node --check api/telegram.js
node scripts/crawl-faq.mjs
```

The crawler requires Node.js 20+.

## Scope policy

This project is deliberately source-bound. If a question is not supported by the indexed official Telegram material, the bot should return no official answer rather than inventing one. Future source types can add official Bot API documentation, Bot Guidelines, and Terms while keeping the same traceable-source rule.
