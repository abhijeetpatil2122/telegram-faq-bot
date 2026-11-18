# Telegram Help Desk Mini App

The Mini App is served from `/miniapp/` by the existing Vercel project. It reuses the single generated `data/knowledge.json` dataset, `config/categories.json`, and `scripts/search-engine.mjs`. No second crawler, dataset, database or generative-answer system is introduced.

## Launch

The bot's `/start` and `/app` Rich Messages include a `web_app` button pointing to `https://telegram-faq-bot.vercel.app/miniapp/`. The button is intended for private chats. Optionally set `FAQ_MINI_APP_URL` in Vercel if the canonical URL changes.

To set a persistent menu button, use @BotFather `/setmenubutton` and the same HTTPS URL. This is a separate BotFather setting and is not changed automatically.

## API

- `GET /api/miniapp` returns public category counts and the total number of indexed entries.
- `POST /api/miniapp` accepts `{ initData, query, category }`, verifies the signed Telegram `initData`, applies the existing deterministic search ranking and returns up to 30 source-linked results.

The server verifies the raw `initData` using Telegram's HMAC-SHA-256 scheme and the existing `BOT_TOKEN`, checks `auth_date` freshness and only then trusts the parsed user ID. Client-side `initDataUnsafe` is never used as authentication. The browser sanitizes canonical answer HTML through a strict element allowlist before rendering it.

## Telegram APIs used

The frontend uses the official `telegram-web-app.js` bridge and feature-detects methods:
- `WebApp.ready()` and `expand()`
- `WebApp.setHeaderColor()`
- `themeParams`, `colorScheme`, and `themeChanged`
- `BackButton.show()`, `hide()`, and `onClick()`
- `HapticFeedback.impactOccurred()` and `notificationOccurred()`
- `openTelegramLink()` for the native share flow

The UI respects Telegram theme CSS variables and safe-area/viewport variables. It does not request contact, location, biometric or write-access permissions because the FAQ search does not need them.

## Checks

```bash
npm run miniapp:test
npm run check
npm run runtime:test
npm run validate
npm run search:test
npm run search:engine:test
```
