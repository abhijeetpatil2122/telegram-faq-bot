# Telegram Help Desk Mini App

The Mini App is served from `/miniapp/` by the existing Vercel project. It reuses the single generated `data/knowledge.json` dataset, `config/categories.json`, and `scripts/search-engine.mjs`. No second crawler, dataset, database or generative-answer system is introduced.

## Launch

The bot's `/start` and `/app` Rich Messages include a `web_app` button pointing to `https://telegram-faq-bot.vercel.app/miniapp/`. The button is intended for private chats. Optionally set `FAQ_MINI_APP_URL` in Vercel if the canonical URL changes.

To set a persistent menu button, use @BotFather `/setmenubutton` and the same HTTPS URL. This is a separate BotFather setting and is not changed automatically.

## API and trust boundary

- `GET /api/miniapp` returns public category counts and the total number of indexed entries.
- `POST /api/miniapp` accepts `{ initData, query, category }`, verifies the signed Telegram `initData`, applies the existing deterministic search ranking and returns up to 30 source-linked results.\n- The same endpoint accepts `{ action: 'prepare-share', initData, itemId }`, validates the same signed session, finds the canonical knowledge entry and calls Bot API `savePreparedInlineMessage` for that user.

The server verifies the raw `initData` using Telegram's HMAC-SHA-256 scheme and the existing `BOT_TOKEN`, checks `auth_date` freshness and only then trusts the parsed user ID. Client-side `initDataUnsafe` is never used as authentication. The browser sanitizes canonical answer HTML through a strict element allowlist before rendering it.

## Telegram Mini App integration

The frontend uses Telegram's official `telegram-web-app.js` bridge and feature-detects optional methods:

- Startup and sizing: `ready()`, `expand()`, and Bot API 8.0+ `requestFullscreen()`, with the normal expanded webview as a fallback.
- Native navigation: one `BackButton.onClick()` handler backed by the app's internal view stack; no duplicate in-page back controls.
- Layout: Telegram viewport, system safe-area and content-safe-area CSS variables, plus viewport/safe-area/fullscreen events.
- Appearance: `themeParams`, `colorScheme`, `themeChanged`, `setHeaderColor()`, `setBackgroundColor()`, and Bot API 7.10+ `setBottomBarColor()`.
- Interaction: `HapticFeedback.impactOccurred()`.
- Sharing: Bot API 8.0+ uses `savePreparedInlineMessage` on the server and `WebApp.shareMessage(preparedMessageId)` in the client. Telegram opens its native preview/chat picker with a ready-to-send rich FAQ answer and source. The prepared message is scoped to the authenticated Telegram user and can be sent to private chats, groups and channels. If prepared sharing is unavailable, `switchInlineQuery(selectedQuestion, ['users', 'groups', 'channels'])` falls back to the existing TeleFQBot inline-query flow. The existing `inlineResults()` handler remains unchanged.
- Profile: the top-right avatar and profile details are read locally from `initDataUnsafe.user` for display only. They are not sent to the search API and are never trusted for authentication.

The Mini App does not request contact, location, biometric or write-access permissions because FAQ search does not need them. The fullscreen request is feature-detected and can be declined by older clients; the app remains usable in the regular expanded view.

## Checks

```bash
npm run miniapp:test
npm run check
npm run runtime:test
npm run validate
npm run search:test
npm run search:engine:test
```
