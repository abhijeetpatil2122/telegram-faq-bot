# Sources

> **Source policy**  
> Curated official Telegram documentation only.  
> Maintained by **Abhijeet Patil** — `@Religiouskid` · `@Para0x`

The source registry is intentionally curated instead of mirroring every page available across Telegram's documentation ecosystem. The goal is a useful Help Desk, not a complete technical archive.

## ◇ Indexed coverage

### User & account help

- `telegram-faq` — general Telegram usage, accounts, chats, privacy, groups, calls and media.
- `telegram-faq-spam` — spam limitations, reporting and account restrictions.
- `telegram-faq-premium` — Premium subscriptions and user-facing Premium features.
- `telegram-faq-channels` — channels, subscribers and channel management.
- `telegram-privacy` — privacy and data-handling information.
- `telegram-stars`, `telegram-gifts`, `telegram-gift-marketplace` — user-facing digital payments and gifts.
- `telegram-stories`, `telegram-live-stories`, `telegram-search`, `telegram-communities` — stories, discovery and community features.

### Automatically discovered announcements

The crawler reads the official Telegram Blog listing and discovers new article links under `https://telegram.org/blog/`. It:

1. accepts only HTTPS article URLs on Telegram's official host;
2. excludes known API/developer announcement patterns;
3. deduplicates canonical article URLs against curated sources;
4. caps each run to a bounded number of new candidates;
5. extracts user-facing feature sections and assigns a best-effort user FAQ category;
6. skips newly discovered pages that cannot be safely extracted, without blocking established FAQ sources.

New announcements are included in the generated dataset only after the same knowledge, Rich HTML, user-audience and search checks pass.

## ⟡ Explicitly excluded

This repository is **not** a Telegram developer documentation index. The following are outside the normal FAQ scope and must not enter its search dataset:

- Bot API reference and Bot API changelog
- MTProto and TDLib documentation
- Bot developer tutorials, webhooks, tokens and Mini App development guides
- Developer terms and API implementation references

Telegram Business documentation hosted under a developer API path is also excluded unless a separate user-facing FAQ or product announcement is available.

Telegram Blog and Telegram Evolution are discovery surfaces, not blanket permission to index every linked page. Only user-facing Telegram feature announcements are eligible.

## 🛡 Source admission rules

A new source should have:

- an official Telegram URL
- a defined audience
- a category
- a priority
- an extraction strategy
- meaningful content for the Help Desk
- safe, predictable output under the crawler

A page is never indexed merely because it exists on an official Telegram domain.

## ◌ Guiding principle

**Quality of coverage beats volume of pages.**

The registry should grow when new official Telegram material makes the Help Desk genuinely more useful — not simply because more URLs are available.
