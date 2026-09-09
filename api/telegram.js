import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const KNOWLEDGE_PATH = path.join(process.cwd(), 'data', 'knowledge.json');
const MAX_RESULTS = 50;
const MIN_SCORE = 24;
const INLINE_CACHE_TIME = 0;
const ARTICLE_THUMBNAIL_URL = 'https://image.zaw-myo.workers.dev/file/dc44d72e-a7b8-45f2-b249-a6bcaa6720c0';
const HELP_THUMBNAIL_URL = 'https://image.zaw-myo.workers.dev/file/510c3a83-8a96-416c-b1ea-a37dddb6638f';
const NO_RESULTS_THUMBNAIL_URL = 'https://image.zaw-myo.workers.dev/file/6132b4a1-1e93-41a7-a76f-fa199577ad90';
const DEFAULT_BOT_USERNAME = 'TeleFQBot';

const SEARCH_STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'can', 'could', 'do', 'does', 'for', 'from',
  'how', 'i', 'in', 'is', 'it', 'me', 'of', 'on', 'or', 'please', 'tell', 'that', 'the',
  'this', 'to', 'what', 'when', 'where', 'which', 'who', 'why', 'with', 'you', 'your'
]);

function loadKnowledge() {
  try {
    const data = JSON.parse(fs.readFileSync(KNOWLEDGE_PATH, 'utf8'));
    return Array.isArray(data.items) ? data.items : [];
  } catch (error) {
    console.error('Unable to load knowledge dataset:', error);
    return [];
  }
}

const KNOWLEDGE = loadKnowledge();
let botProfilePromise;

function normalize(value = '') {
  return String(value).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function queryTokens(query) {
  return [...new Set(normalize(query).split(' ').filter((token) => token.length >= 2 && !SEARCH_STOPWORDS.has(token)))];
}

function tokenize(value) {
  return new Set(normalize(value).split(' ').filter(Boolean));
}

function searchableFields(item) {
  return {
    question: normalize(item.question ?? ''),
    title: normalize(item.title ?? ''),
    section: normalize(item.section ?? ''),
    aliases: (item.aliases ?? []).map(normalize).filter(Boolean),
    keywords: (item.keywords ?? []).map(normalize).filter(Boolean)
  };
}

function containsWholePhrase(field, query) {
  return Boolean(field && query && (` ${field} `).includes(` ${query} `));
}

function tokenCoverage(tokens, field) {
  if (!tokens.length || !field) return 0;
  const fieldTokens = tokenize(field);
  return tokens.filter((token) => fieldTokens.has(token)).length;
}

function score(item, query) {
  const normalizedQuery = normalize(query);
  const tokens = queryTokens(query);
  if (!normalizedQuery || !tokens.length) return 0;

  const fields = searchableFields(item);
  const allFields = [fields.question, fields.title, fields.section, ...fields.aliases, ...fields.keywords].filter(Boolean);
  const primary = fields.question || fields.title;
  const primaryTokens = tokenize(primary);
  const uniqueTokenCount = tokens.length;
  const matchedPrimary = tokenCoverage(tokens, primary);
  const matchedTitle = tokenCoverage(tokens, fields.title);
  const matchedSection = tokenCoverage(tokens, fields.section);
  const matchedAliases = tokenCoverage(tokens, fields.aliases.join(' '));
  const matchedKeywords = tokenCoverage(tokens, fields.keywords.join(' '));
  let points = 0;

  if (fields.question === normalizedQuery) points += 1000;
  if (fields.title === normalizedQuery) points += 900;
  if (fields.section === normalizedQuery) points += 700;
  if (containsWholePhrase(fields.question, normalizedQuery)) points += 420;
  if (containsWholePhrase(fields.title, normalizedQuery)) points += 360;
  if (containsWholePhrase(fields.section, normalizedQuery)) points += 220;
  if (fields.aliases.some((field) => containsWholePhrase(field, normalizedQuery))) points += 300;
  if (fields.keywords.some((field) => containsWholePhrase(field, normalizedQuery))) points += 180;
  if (fields.question.startsWith(normalizedQuery)) points += 260;
  else if (fields.title.startsWith(normalizedQuery)) points += 220;
  else if (fields.section.startsWith(normalizedQuery)) points += 140;
  if (fields.question.includes(normalizedQuery)) points += 140;
  if (fields.title.includes(normalizedQuery)) points += 120;
  if (fields.section.includes(normalizedQuery)) points += 80;

  points += matchedPrimary * 90;
  points += matchedTitle * 65;
  points += matchedSection * 35;
  points += matchedAliases * 45;
  points += matchedKeywords * 20;

  if (matchedPrimary === uniqueTokenCount) points += 260;
  else if (matchedPrimary >= Math.max(1, uniqueTokenCount - 1)) points += 100;

  const matchedAny = tokens.filter((token) => allFields.some((field) => tokenize(field).has(token))).length;
  if (matchedAny === uniqueTokenCount) points += 120;
  else if (matchedAny < Math.ceil(uniqueTokenCount / 2)) points -= 35;

  if (primaryTokens.size && matchedPrimary === primaryTokens.size && primaryTokens.size <= uniqueTokenCount) points += 45;
  return points;
}

function searchKnowledge(query) {
  if (!normalize(query)) return KNOWLEDGE.slice();
  return KNOWLEDGE
    .map((item) => ({ item, score: score(item, query) }))
    .filter(({ score: itemScore }) => itemScore >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || (a.item.question ?? a.item.title ?? '').localeCompare(b.item.question ?? b.item.title ?? ''))
    .map(({ item }) => item);
}

function paginate(items, offset) {
  const parsed = Number.parseInt(offset || '0', 10);
  const start = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  const results = items.slice(start, start + MAX_RESULTS);
  return { results, next_offset: start + results.length < items.length ? String(start + results.length) : '' };
}

function htmlEscape(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function safeResultId(prefix, value) {
  return `${prefix}-${createHash('sha256').update(String(value)).digest('hex').slice(0, 32)}`;
}

function safeButtonUrl(value) {
  let raw = String(value ?? '').trim();
  if (!raw || /^(?:javascript|data|vbscript):/i.test(raw)) return null;

  // Normalize browser-openable bare domains/hosts to HTTPS.
  // Examples: api.telegram.org, core.telegram.org/bots/features#privacy-mode
  if (/^[\w.-]+\.[A-Za-z]{2,}(?::\d+)?(?:[/?#]|$)/.test(raw)) {
    raw = `https://${raw}`;
  }

  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:' && url.protocol !== 'tg:') return null;
    if (!url.hostname && url.protocol !== 'tg:') return null;
    return url.href;
  } catch {
    return null;
  }
}

function richUrlButton(label, href, style = 'primary') {
  const url = safeButtonUrl(href);
  if (!url) return null;
  const safeLabel = String(label ?? '').replace(/\s+/g, ' ').trim().slice(0, 180) || 'Open link';
  return `<tg-button type="url" style="${style}" url="${htmlEscape(url)}">${htmlEscape(safeLabel)}</tg-button>`;
}

function promoteExternalLinks(html) {
  // Promote every browser/TG URL found in source anchors to a Rich URL button.
  // This intentionally accepts fragments (#...), query strings and bare hosts.
  // Internal fragment-only links remain normal anchors because they are not
  // standalone destinations and cannot be opened outside the rendered message.
  return String(html ?? '').replace(/<a\b([^>]*?)\bhref=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi, (match, before, href, after, labelHtml) => {
    const label = String(labelHtml).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const button = richUrlButton(label, href, 'primary');
    return button ?? match;
  });
}

function renderAnswerHtml(item) {
  const html = String(item.answer_html ?? '').trim();
  if (!html) return `<p>${htmlEscape(item.answer ?? 'No answer text is available for this entry.')}</p>`;
  return promoteExternalLinks(html);
}

function sourceFooter(item) {
  const sourceTitle = item.source?.title ?? 'Official Telegram source';
  const sourceUrl = safeButtonUrl(item.source?.url);
  const button = sourceUrl
    ? `<tg-button type="url" style="primary" url="${htmlEscape(sourceUrl)}">${htmlEscape(sourceTitle)}</tg-button>`
    : null;

  // Keep only the word "Source:" as normal footer text. The source name itself
  // is the clickable Rich button, so it is never duplicated as plain text.
  return `<footer>Source:${button ? ` ${button}` : ` ${htmlEscape(sourceTitle)}`}</footer>`;
}

function niceDescription(item) {
  const source = item.source?.title ?? 'Official Telegram source';
  const section = item.section && item.section !== item.title ? ` • ${item.section}` : '';
  return `${source}${section} • Official documentation`.slice(0, 255);
}

function renderRichAnswer(item) {
  const title = item.question ?? item.title ?? 'Telegram documentation';
  return [
    `<h2>❓ ${htmlEscape(title)}</h2>`,
    `<details><summary>Answer</summary>${renderAnswerHtml(item)}</details>`,
    '<hr/>',
    sourceFooter(item)
  ].join('\n');
}

function noResultsContent(query) {
  return {
    rich_message: {
      html: [
        '<footer>No matching answer was found in the official Telegram knowledge base.</footer>',
        '<tg-button-row align="left"><tg-button type="switch_inline_query_current_chat" style="primary" query="">🔎 Search again</tg-button></tg-button-row>'
      ].join('\n')
    }
  };
}

function noResultsHelpArticle(query) {
  return {
    type: 'article',
    id: safeResultId('search-help', 'static'),
    title: 'How to search this bot',
    description: 'Search the official Telegram knowledge base.',
    thumbnail_url: HELP_THUMBNAIL_URL,
    input_message_content: {
      rich_message: {
        html: [
          '<footer>Ask a short, specific question about Telegram, bots, Bot API features or official bot terms.</footer>',
          '<tg-button-row align="left"><tg-button type="switch_inline_query_current_chat" style="primary" query="">🔎 Search again</tg-button></tg-button-row>'
        ].join('\n')
      }
    }
  };
}

function inlineResults(query, offset) {
  const allMatches = searchKnowledge(query);
  if (!allMatches.length) {
    if (offset) return { results: [], next_offset: '' };
    return {
      results: [
        {
          type: 'article',
          id: safeResultId('no-results', query || 'empty'),
          title: query.trim() ? `No results for “${query.trim().slice(0, 60)}”` : 'No results found',
          description: 'No matching information in the official Telegram sources.',
          thumbnail_url: NO_RESULTS_THUMBNAIL_URL,
          input_message_content: noResultsContent(query)
        },
        noResultsHelpArticle(query)
      ],
      next_offset: ''
    };
  }

  const page = paginate(allMatches, offset);
  return {
    results: page.results.map((item) => ({
      type: 'article',
      id: safeResultId('faq', item.id ?? item.question ?? item.title),
      title: item.question ?? item.title ?? 'Telegram documentation',
      description: niceDescription(item),
      thumbnail_url: ARTICLE_THUMBNAIL_URL,
      input_message_content: { rich_message: { html: renderRichAnswer(item) } }
    })),
    next_offset: page.next_offset
  };
}

async function telegram(method, payload) {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error('BOT_TOKEN is not configured');
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.ok === false) {
    const error = new Error(`Telegram ${method} failed: HTTP ${response.status} ${body?.description ?? ''}`.trim());
    error.status = response.status;
    error.description = body?.description ?? '';
    throw error;
  }
  return body;
}

function isExpiredInlineQueryError(error) {
  return error?.status === 400 && /query is too old|response timeout expired|query id is invalid/i.test(error?.description ?? error?.message ?? '');
}

async function getBotProfile(forceRefresh = false) {
  if (forceRefresh) botProfilePromise = null;
  if (!botProfilePromise) {
    botProfilePromise = telegram('getMe').then((response) => response.result).catch((error) => {
      botProfilePromise = null;
      throw error;
    });
  }
  return botProfilePromise;
}

function botUsername(profile) {
  return profile?.username ? `@${profile.username}` : `@${DEFAULT_BOT_USERNAME}`;
}

function parseCommand(text, username) {
  const match = String(text ?? '').trim().match(/^\/(start|help|ping)(?:@([A-Za-z0-9_]{5,32}))?(?:\s+.*)?$/i);
  if (!match) return null;
  if (match[2] && username && match[2].toLowerCase() !== username.toLowerCase()) return null;
  return match[1].toLowerCase();
}

function startMessageHtml(username) {
  return [
    `<b>👋 Welcome to ${htmlEscape(username)}</b>`,
    'Ask me a Telegram, Bot API or official bot-terms question.',
    'I search the official Telegram knowledge base and return matching documentation.',
    '',
    'Use inline mode: type <code>@' + htmlEscape(username.replace(/^@/, '')) + ' your question</code>'
  ].join('\n');
}

function helpMessageHtml(username) {
  return [
    '<b>ℹ️ Help</b>',
    'Ask a short, specific question about Telegram, bots, Bot API features or official bot terms.',
    '',
    'Examples:',
    '• <code>How do I create a bot?</code>',
    '• <code>What is inline mode?</code>',
    '• <code>How do webhooks work?</code>',
    '',
    'Use inline mode: type <code>@' + htmlEscape(username.replace(/^@/, '')) + ' your question</code>'
  ].join('\n');
}

function pingMessageHtml() {
  return '<b>🏓 Pong!</b> Bot is online.';
}

async function handleMessage(update, profile) {
  const message = update.message;
  if (!message?.chat?.id) return;

  const command = parseCommand(message.text, profile?.username);
  if (!command) return;

  const username = botUsername(profile);
  const html = command === 'start'
    ? startMessageHtml(username)
    : command === 'help'
      ? helpMessageHtml(username)
      : pingMessageHtml();

  await telegram('sendMessage', {
    chat_id: message.chat.id,
    text: html,
    parse_mode: 'HTML',
    disable_web_page_preview: true
  });
}

function validateSecret(req) {
  const expected = process.env.WEBHOOK_SECRET;
  if (!expected) return true;
  return req.headers['x-telegram-bot-api-secret-token'] === expected;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(200).json({ ok: true, service: 'telegram-faq-bot' });
    return;
  }

  if (!validateSecret(req)) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return;
  }

  try {
    const update = req.body ?? {};
    const profile = await getBotProfile();

    if (update.inline_query) {
      const query = String(update.inline_query.query ?? '');
      const offset = String(update.inline_query.offset ?? '');
      const result = inlineResults(query, offset);
      await telegram('answerInlineQuery', {
        inline_query_id: update.inline_query.id,
        results: result.results,
        cache_time: INLINE_CACHE_TIME,
        is_personal: true,
        next_offset: result.next_offset
      });
      res.status(200).json({ ok: true });
      return;
    }

    if (update.message) {
      await handleMessage(update, profile);
      res.status(200).json({ ok: true });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    if (isExpiredInlineQueryError(error)) {
      console.warn('Ignoring expired inline query:', error.description ?? error.message);
      res.status(200).json({ ok: true });
      return;
    }

    console.error('Telegram webhook error:', error);
    res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}