# Telegram FAQ Bot

A serverless Telegram inline FAQ bot backed by curated official Telegram documentation.

## Architecture

- **Telegram** — inline queries and webhook updates.
- **Vercel** — serverless webhook/API runtime.
- **GitHub Actions** — scheduled official-source crawler and data refresh.
- **GitHub** — source control and versioned FAQ dataset.
- **No VPS / database required.**

## Initial official sources

- https://telegram.org/faq
- https://core.telegram.org/bots/faq
- https://core.telegram.org/bots
- https://core.telegram.org/bots/features

The project deliberately avoids general AI answers. An answer must be traceable to an official Telegram source.

## Status

Initial repository bootstrap. The crawler, FAQ data model, inline search, and Vercel webhook are being built incrementally.
