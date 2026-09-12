import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { searchKnowledge as retrieveKnowledge } from '../scripts/search-engine.mjs';

const KNOWLEDGE_PATH = path.join(process.cwd(), 'data', 'knowledge.json');
const MAX_RESULTS = 50;
const MIN_SCORE = 24;
const INLINE_CACHE_TIME = 0;
const ARTICLE_THUMBNAIL_URL = 'https://image.zaw-myo.workers.dev/file/dc44d72e-a7b8-45f2-b249-a6bcaa6720c0';
const HELP_THUMBNAIL_URL = 'https://image.zaw-myo.workers.dev/file/510c3a83-8a96-416c-b1ea-a37dddb6638f';
const NO_RESULTS_THUMBNAIL_URL = 'https://image.zaw-myo.workers.dev/file/6132b4a1-1e93-41a7-a76f-fa199577ad90';
const DEFAULT_BOT_USERNAME = 'TeleFQBot';

// Cached getMe promise. Keep the promise itself so concurrent webhook requests
// during a cold start share one Telegram API call instead of racing.
let botProfilePromise = null;

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
  if (/^[\w.-]+\.[A-Za-z]{2,}(?::\d+)?(?:[/?#]|$)/.test(raw)) raw = `https://${raw}`;
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
  const sourceHtml = String(html ?? '');
  const tableParts = sourceHtml.split(/(<table\b[\s\S]*?<\/table>)/gi);
  return tableParts.map((part) => {
    if (/^<table\b/i.test(part)) return part;
    return part.replace(/<a\b([^>]*?)\bhref=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi, (match, before, href, after, labelHtml) => {
      const label = String(labelHtml).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const button = richUrlButton(label, href, 'primary');
      return button ?? match;
    });
  }).join('');
}

function renderAnswerHtml(item) {
  const html = String(item.answer_html ?? '').trim();
  if (!html) return `<p>${htmlEscape(item.answer ?? 'No answer text is available for this entry.')}</p>`;
  return promoteExternalLinks(html);
}

function sourceFooter(item) {
  const sourceTitle = item.source?.title ?? 'Official Telegram source';
  const sourceUrl = safeButtonUrl(item.source?.url);
  return sourceUrl
    ? `<footer>Source: <a href="${htmlEscape(sourceUrl)}">${htmlEscape(sourceTitle)}</a></footer>`
    : `<footer>Source: ${htmlEscape(sourceTitle)}</footer>`;
}

function niceDescription(item) {
  const source = item.source?.title ?? 'Official Telegram source';
  const section = item.section && item.section !== item.title ? ` • ${item.section}` : '';
  const category = item.category ? ` • ${item.category}` : '';
  return `${source}${section}${category} • Official documentation`.slice(0, 255);
}

function renderRichAnswer(item) {
  const title = item.question ?? item.title ?? 'Telegram documentation';
  const category = item.category ? `<p><b>Category:</b> ${htmlEscape(item.category)}</p>` : '';
  const sourceUrl = safeButtonUrl(item.source?.url);
  const sourceTitle = item.source?.title ?? 'Official Telegram source';
  const sourceButton = sourceUrl ? richUrlButton(`Open ${sourceTitle}`, sourceUrl, 'primary') : null;
  return [
    `<h2>❓ ${htmlEscape(title)}</h2>`,
    category,
    `<details open><summary>Answer</summary>${renderAnswerHtml(item)}</details>`,
    '<hr/>',
    sourceFooter(item),
    sourceButton ? `<tg-button-row align="left">${sourceButton}</tg-button-row>` : ''
  ].filter(Boolean).join('\n');
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
  const allMatches = retrieveKnowledge(KNOWLEDGE, query, { minScore: MIN_SCORE });
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
  const cleanUsername = username.replace(/^@/, '');
  return [
    '<h1>👋 Welcome!</h1>',
    `<p><b>${htmlEscape(username)}</b> is an official Telegram knowledge search bot.</p>`,
    '<p>Search questions about Telegram, bots, Bot API features and official bot terms. Answers come only from the official Telegram sources indexed by this bot.</p>',
    '<details><summary>How to search</summary><ol><li>Tap <b>Search Telegram</b>.</li><li>Type a short, specific question.</li><li>Select the most relevant official answer.</li></ol></details>',
    '<tg-button-row align="left"><tg-button type="switch_inline_query_current_chat" style="primary" query="">🔎 Search Telegram</tg-button></tg-button-row>',
    '<tg-button-row align="left"><tg-button type="url" style="success" url="https://core.telegram.org/bots/api">📘 Bot API</tg-button><tg-button type="url" style="primary" url="https://www.telegram.org/faq">📚 Telegram FAQ</tg-button></tg-button-row>',
    `<footer>Inline usage: <code>@${htmlEscape(cleanUsername)} your question</code></footer>`
  ].join('\n');
}

function helpMessageHtml(username) {
  const cleanUsername = username.replace(/^@/, '');
  return [
    '<h2>🛠 Help & Commands</h2>',
    '<p>Use these commands or search the official Telegram knowledge base in inline mode.</p>',
    '<details open><summary>Commands</summary><ul><li><code>/start</code> — Open the welcome screen.</li><li><code>/help</code> — Show this help menu.</li><li><code>/ping</code> — Check bot response time.</li></ul></details>',
    '<details><summary>Inline search</summary><p>Type <code>@' + htmlEscape(cleanUsername) + ' your question</code> in any chat.</p><p>Examples:</p><ul><li><code>How do I create a bot?</code></li><li><code>What is inline mode?</code></li><li><code>How do webhooks work?</code></li></ul></details>',
    '<tg-button-row align="left"><tg-button type="switch_inline_query_current_chat" style="primary" query="">🔎 Search Telegram</tg-button></tg-button-row>',
    '<tg-button-row align="left"><tg-button type="url" style="success" url="https://core.telegram.org/bots/api">📘 Bot API</tg-button><tg-button type="url" style="primary" url="https://www.telegram.org/faq">📚 Telegram FAQ</tg-button></tg-button-row>',
    '<footer>Answers are based on official Telegram documentation.</footer>'
  ].join('\n');
}

function pingMessageHtml(latencyMs) {
  return [
    '<h2>🏓 Pong!</h2>',
    `<p><b>Response time:</b> ${latencyMs} ms</p>`,
    '<footer>Telegram Bot API round-trip latency</footer>'
  ].join('\n');
}

async function handleMessage(update, profile) {
  const message = update.message;
  if (!message?.chat?.id) return;

  const command = parseCommand(message.text, profile?.username);
  if (!command) return;

  const username = botUsername(profile);
  let html;

  if (command === 'start') {
    html = startMessageHtml(username);
  } else if (command === 'help') {
    html = helpMessageHtml(username);
  } else {
    const pingStartedAt = performance.now();
    await telegram('getMe');
    const latencyMs = Math.max(1, Math.round(performance.now() - pingStartedAt));
    html = pingMessageHtml(latencyMs);
  }

  await telegram('sendRichMessage', {
    chat_id: message.chat.id,
    rich_message: { html },
    disable_notification: false
  });
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(200).json({ ok: true });
    return;
  }

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && request.headers['x-telegram-bot-api-secret-token'] !== secret) {
    response.status(401).json({ ok: false });
    return;
  }

  try {
    const update = request.body ?? {};
    const profile = await getBotProfile();

    if (update.inline_query) {
      const queryId = update.inline_query.id;
      const query = update.inline_query.query ?? '';
      const offset = update.inline_query.offset ?? '';
      try {
        const page = inlineResults(query, offset);
        await telegram('answerInlineQuery', {
          inline_query_id: queryId,
          results: page.results,
          cache_time: INLINE_CACHE_TIME,
          is_personal: true,
          next_offset: page.next_offset
        });
      } catch (error) {
        if (!isExpiredInlineQueryError(error)) throw error;
      }
    } else if (update.message) {
      await handleMessage(update, profile);
    }

    response.status(200).json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    response.status(200).json({ ok: false });
  }
}