# Telegram FAQ Bot

A serverless Telegram inline help bot backed only by official Telegram documentation, FAQs, guides and terms.

## Architecture

```text
Official Telegram help material
        ↓
GitHub Actions crawler
        ↓
data/knowledge.json
        ↓
Vercel serverless webhook
        ↓
Telegram inline search
```

- **Telegram** — inline queries and webhook updates.
- **Vercel** — serverless webhook/API runtime.
- **GitHub Actions** — scheduled official-source crawler.
- **GitHub** — versioned knowledge dataset; no database required.
- **No VPS required.**

## Source policy

This is intentionally a **help/FAQ guide**, not a Bot API reference browser.

### Included

- Telegram FAQ
- Bots FAQ
- Bots: An introduction for developers
- Telegram Bot Features
- Telegram Bot Platform Developer Terms
- Terms of Service for Bots

These sources cover questions such as what bots can do, how bots work, privacy behavior, inline mode, Mini Apps, Business Bots, bot features, developer restrictions, user-facing bot terms and other practical Telegram bot questions.

### Deliberately excluded

The full **Bot API reference** is not indexed as general knowledge. It is primarily a method/type/parameter reference for developers, rather than the help-guide knowledge this project is designed to provide.

If we later need API-method lookup, it should be a separate search mode or separate project rather than polluting the FAQ/help search results.

## Repository structure

```text
api/telegram.js              # Vercel webhook + knowledge search
scripts/crawl-faq.mjs        # Official-source crawler/parser
data/faq.json                # FAQ subset of the generated dataset
data/knowledge.json          # FAQ + guides + terms
.github/workflows/update-faq.yml
```

## How updates work

GitHub Actions runs the crawler every 6 hours and can also be started manually. The crawler:

1. Fetches only the configured official Telegram sources.
2. Extracts explicit `Q:` FAQ entries from FAQ pages.
3. Extracts meaningful sections from official bot guides and terms.
4. Refuses to publish an empty result for a source.
5. Produces deterministic JSON so timestamps do not create fake changes.
6. Commits the generated datasets only when their content actually changes.

This keeps temporary source outages or parser regressions from silently wiping the knowledge base.

## Vercel environment variables

Set these in the Vercel project:

- `BOT_TOKEN` — Telegram bot token from @BotFather.
- `TELEGRAM_WEBHOOK_SECRET` — a long random secret used to verify webhook requests.

After deployment, configure the Telegram webhook to point to the Vercel `/api/telegram` endpoint using the same secret token. Enable inline mode for the bot through @BotFather.

## Local checks

```bash
node --check api/telegram.js
node scripts/crawl-faq.mjs
```

The crawler requires Node.js 20+.

## Scope policy

The bot is source-bound. Every returned answer comes from indexed official Telegram material and includes its source link. If the indexed material does not support a question, the bot returns no official answer instead of inventing one.
