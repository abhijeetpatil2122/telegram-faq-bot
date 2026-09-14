<div align="center">

# ✦ Telegram Help Desk

### A source-bound Telegram documentation assistant built around official Telegram knowledge.

**Built & maintained by [Abhijeet Patil](https://t.me/Religiouskid)**  
`@Religiouskid` · `@Para0x`

[![Runtime](https://img.shields.io/badge/runtime-Vercel-black?style=flat-square)](https://vercel.com/)
[![Automation](https://img.shields.io/badge/updates-GitHub_Actions-2088FF?style=flat-square)](https://github.com/features/actions)
[![Node](https://img.shields.io/badge/Node.js-24.x-339933?style=flat-square)](https://nodejs.org/)
[![Telegram](https://img.shields.io/badge/source-Official_Telegram-2AABEE?style=flat-square)](https://telegram.org/)

</div>

---

> **The idea is simple:** Telegram's documentation is the authority.  
> This project turns that documentation into a fast, structured and deterministic Help Desk inside Telegram — without inventing answers.

## ◈ What this project is

**Telegram Help Desk** is a serverless documentation system for Telegram users and bot developers.

It maintains a curated, versioned knowledge dataset from official Telegram sources, indexes that dataset with deterministic search, and presents supported answers as Telegram **Rich Messages** with the original source attached.

### The core principles

| Principle | What it means |
| --- | --- |
| **Official-first** | Knowledge comes from official Telegram documentation. |
| **Deterministic** | The same indexed knowledge and query produce predictable results. |
| **Source-bound** | Every answer remains tied to its official source. |
| **Safe publishing** | Failed or suspicious crawls do not replace the last good dataset. |
| **Serverless** | Telegram handling runs on Vercel; knowledge building runs in GitHub Actions. |
| **Rich by design** | Answers preserve useful Telegram formatting instead of becoming flat text. |

---

## ✦ Feature set

```text
🔎  Inline Help Desk search
📚  Curated official Telegram knowledge
🧠  Deterministic ranking + confidence threshold
🧩  Rich Messages with structured formatting
🔗  Official source controls on answers
🛠  Protected admin control center
🔄  Automated six-hour knowledge refresh
🩺  Health + source diagnostics
🗄  Generated knowledge storage visibility
🚫  No fabricated answers
☁️  Vercel serverless runtime
```

### Telegram interface

Supported commands:

| Command | Action |
| --- | --- |
| `/start` | Open the Help Desk welcome screen |
| `/help` | Show usage and search guidance |
| `/ping` | Check Telegram API round-trip latency |
| `/admin` | Open the protected admin control center |

Inline mode works like:

```text
@YourBotUsername how do I enable passkeys?
```

The admin area is restricted to Telegram user IDs configured through `ADMIN_IDS` and uses Rich Message callbacks to navigate without filling the chat with new messages.

---

## ⟡ How the system works

```text
        OFFICIAL TELEGRAM SOURCES
                    │
                    ▼
          config/sources.json
                    │
                    ▼
        scripts/crawl/index.mjs
                    │
          extraction + safety
          normalization + HTML
                    │
                    ▼
          data/knowledge.json
                    │
                    ▼
       validation + regression tests
                    │
                    ▼
           VERCEL /api/telegram.js
                    │
          deterministic search
                    │
                    ▼
          Rich Message renderer
                    │
                    ▼
             TELEGRAM BOT
```

**Important separation:** the Vercel runtime does **not** crawl Telegram. Crawling and knowledge generation happen in GitHub Actions; Vercel only serves the generated dataset.

---

## ◇ Knowledge pipeline

Every scheduled update follows the same controlled path:

**01 · Select**  
Only sources explicitly enabled for indexing are considered.

**02 · Fetch**  
Requests use bounded timeouts, a controlled user agent and response-size limits.

**03 · Extract**  
FAQ questions and meaningful guide/terms sections are converted into structured entries.

**04 · Sanitize**  
HTML is reduced to the supported Telegram Rich Message subset.

**05 · Protect**  
Empty sources, catastrophic entry-count drops and invalid output stop publication.

**06 · Validate**  
Knowledge schema, Rich HTML, search regression and runtime checks must pass.

**07 · Publish**  
Only then are generated knowledge files committed back to the repository.

This makes the repository itself the versioned knowledge store.

---

## ◈ Search philosophy

The Help Desk deliberately does **not** ask an LLM to invent an answer.

Search combines:

- exact question and title matching
- phrase aliases
- indexed aliases and keywords
- section and category relevance
- source priority
- token coverage
- developer/user audience signals
- typo-tolerant matching where appropriate
- confidence thresholds and no-result protection

```text
query
  ↓
normalize
  ↓
expand phrases + aliases
  ↓
score indexed knowledge
  ↓
apply relevance safeguards
  ↓
confidence threshold
  ↓
Rich Message + official source
```

If the indexed official material cannot support a question, the correct response is **no official result**.

---

## ⌁ Source policy

The source registry is intentionally curated. Being hosted on an official Telegram domain does not automatically make a page suitable for general Help Desk indexing.

### Indexed coverage

**User & account help**

- Telegram FAQ
- Telegram Spam FAQ
- Telegram Premium FAQ
- Telegram Channels FAQ
- Telegram Privacy Policy

**Bots & developer help**

- Bots FAQ
- Bots introduction
- Telegram Bot Features
- Telegram Bot Developer Terms
- Telegram Bot Terms
- Telegram Business
- Telegram Stars
- Telegram Gifts
- Gift Marketplace
- Stories and related official documentation
- Other configured official Telegram documentation relevant to the Help Desk scope

### Discovery-only material

Some official Telegram pages are tracked for discovery and coverage but are intentionally kept outside general user-help indexing when their content is too technical or too broad.

The important rule is **curation over volume**: the Help Desk should answer useful Telegram questions, not become an indiscriminate mirror of every technical page.

---

## 🛡 Reliability model

The generated dataset is protected by multiple layers:

```text
bounded fetch
     ↓
source minimum checks
     ↓
catastrophic-drop protection
     ↓
HTML safety validation
     ↓
schema validation
     ↓
search regression
     ↓
benchmark + runtime tests
     ↓
commit
```

A failed crawl leaves the previously published knowledge dataset intact rather than replacing it with partial data.

---

## ⚙ Admin Control Center

`/admin` provides a protected operational view with:

```text
🛠 Admin Control Center

[ 📊 Statistics ] [ 🔄 Crawl ]
[ 📚 Sources   ] [ 🩺 Health ]
[ 🗄 Storage   ] [ ⚙️ System ]
```

The **Crawl** screen is a status/control page. `▶️ Run Crawl` queues the GitHub Actions workflow; it never performs the crawl inside Vercel.

The **Sources** screen provides read-only source diagnostics based on the latest successful crawl state.

---

## ⟳ Automated updates

GitHub Actions runs the knowledge refresh every **6 hours** and can also be started manually.

Successful runs can update:

```text
data/knowledge.json
data/crawl-state.json
```

The workflow validates the application and generated dataset before publishing changes.

---

## ◇ Repository map

```text
telegram-faq-bot/
│
├── api/
│   └── telegram.js                 # Vercel Telegram runtime
│
├── config/
│   ├── sources.json                # Source registry
│   ├── categories.json             # Knowledge categories
│   ├── crawler.json                # Crawl safety/configuration
│   ├── search.json                 # Search aliases/configuration
│   └── rich-message.json           # Rich Message contract
│
├── data/
│   ├── knowledge.json              # Generated knowledge base
│   └── crawl-state.json            # Latest successful crawl state
│
├── scripts/
│   ├── crawl/index.mjs             # Knowledge builder
│   ├── search-engine.mjs           # Deterministic search engine
│   ├── validate-knowledge.mjs      # Dataset validation
│   ├── validate-rich-knowledge.mjs # Rich HTML validation
│   ├── admin-source-diagnostics.mjs# Runtime source diagnostics patcher
│   └── tests/                      # Regression + runtime tests
│
├── .github/workflows/
│   └── update-faq.yml              # Scheduled/manual knowledge refresh
│
└── docs/
    ├── ARCHITECTURE.md
    ├── SOURCES.md
    ├── CRAWLER.md
    ├── KNOWLEDGE_SCHEMA.md
    ├── SEARCH.md
    └── RICH_MESSAGES.md
```

---

## 🧪 Local development

Requires **Node.js 24.x**.

```bash
npm install
npm run check
npm run runtime:test
npm run validate
npm run search:test
npm run search:engine:test
npm run search:benchmark
```

To rebuild the generated knowledge locally:

```bash
npm run crawl
```

The crawl command uses the configured official sources and writes the generated dataset only after the crawler's safety rules allow publication.

---

## ☁ Deployment

### Vercel

The Telegram webhook, inline search, admin interface and Rich Message rendering run through the Vercel serverless function.

Required environment variables:

```text
BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
ADMIN_IDS
GITHUB_TOKEN
```

`ADMIN_IDS` is a comma-separated list of Telegram user IDs. `GITHUB_TOKEN` is used by the admin **Run Crawl** control to dispatch the GitHub Actions workflow.

### GitHub Actions

GitHub Actions owns the crawl/build side of the system. Its environment provides the bot notification credentials required by the workflow.

---

## ◌ Documentation

| Document | Focus |
| --- | --- |
| `docs/ARCHITECTURE.md` | System boundaries and design rules |
| `docs/SOURCES.md` | Source registry and indexing policy |
| `docs/CRAWLER.md` | Crawl safety and extraction |
| `docs/KNOWLEDGE_SCHEMA.md` | Generated dataset structure |
| `docs/SEARCH.md` | Ranking and relevance model |
| `docs/RICH_MESSAGES.md` | Telegram presentation contract |

---

## ✦ Project status

**Production-oriented and actively maintainable.**

The project is designed around a deliberately small set of strong guarantees rather than a large collection of unnecessary moving parts.

> **Official source → safe crawl → validated knowledge → deterministic search → structured Telegram answer.**

---

<div align="center">

### Made with care by Abhijeet Patil

**Telegram:** `@Religiouskid` · `@Para0x`

</div>
