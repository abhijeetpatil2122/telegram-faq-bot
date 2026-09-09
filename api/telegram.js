import fs from 'node:fs';
import path from 'node:path';

const KNOWLEDGE_PATH = path.join(process.cwd(), 'data', 'knowledge.json');
const MAX_RESULTS = 10;
const MIN_SCORE = 24;
const DEFAULT_BOT_USERNAME = 'TeleFQBot';

const SEARCH_STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'can', 'could', 'do', 'does',
  'for', 'from', 'how', 'i', 'in', 'is', 'it', 'me', 'of', 'on', 'or',
  'please', 'tell', 'that', 'the', 'this', 'to', 'what', 'when', 'where',
  'which', 'who', 'why', 'with', 'you', 'your'
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
const SOURCE_COUNT = new Set(
  KNOWLEDGE.map((item) => item.source?.url).filter(Boolean)
).size;

let botProfilePromise;

function normalize(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function queryTokens(query) {
  return normalize(query)
    .split(' ')
    .filter((token) => token.length >= 2 && !SEARCH_STOPWORDS.has(token));
}

function tokenize(value) {
  return new Set(normalize(value).split(' ').filter(Boolean));
}

function searchableText(item) {
  return [
    item.question,
    item.title,
    ...(item.aliases ?? []),
    ...(item.keywords ?? [])
  ].filter(Boolean).map(normalize);
}

function score(item, query) {
  const normalizedQuery = normalize(query);
  const tokens = queryTokens(query);
  if (!normalizedQuery || !tokens.length) return 0;

  const fields = searchableText(item);
  const primary = normalize(item.question ?? item.title ?? '');
  const primaryTokens = tokenize(primary);
  let points = 0;

  for (const field of fields) {
    if (field === normalizedQuery) points += 300;
    else if (field.startsWith(normalizedQuery)) points += 160;
    else if (field.includes(normalizedQuery)) points += 90;
  }

  const matchedPrimaryTokens = tokens.filter((token) => primaryTokens.has(token)).length;
  const matchedFieldTokens = tokens.filter((token) => fields.some((field) => tokenize(field).has(token))).length;

  points += matchedPrimaryTokens * 45;
  points += matchedFieldTokens * 12;

  if (tokens.length > 1 && matchedPrimaryTokens === tokens.length) points += 90;
  if (tokens.length > 1 && matchedFieldTokens === tokens.length) points += 45;

  return points;
}

function searchKnowledge(query) {
  if (!normalize(query)) return KNOWLEDGE.slice(0, MAX_RESULTS);

  return KNOWLEDGE
    .map((item) => ({ item, score: score(item, query) }))
    .filter(({ score: itemScore }) => itemScore >= MIN_SCORE)
    .sort((a, b) => b.score - a.score || (a.item.question ?? a.item.title).localeCompare(b.item.question ?? b.item.title))
    .slice(0, MAX_RESULTS)
    .map(({ item }) => item);
}

function htmlEscape(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function trimUrlPunctuation(value) {
  return value.replace(/[.,;:!?]+$/g, '').replace(/\)+$/g, (suffix) => {
    const open = (value.match(/\(/g) ?? []).length;
    const close = (value.match(/\)/g) ?? []).length;
    return close > open ? ')'.repeat(close - open) : '';
  });
}

function richInlineText(value = '') {
  const escaped = htmlEscape(value);
  const tokenPattern = /(https?:\/\/[^\s<]+|@[A-Za-z0-9_]{5,32})/g;
  let result = '';
  let cursor = 0;

  for (const match of escaped.matchAll(tokenPattern)) {
    const token = match[0];
    const index = match.index ?? 0;
    result += escaped.slice(cursor, index);

    if (token.startsWith('@')) {
      const username = token.slice(1);
      result += `<tg-button type="url" style="success" url="https://t.me/${username}">🤖 ${token}</tg-button>`;
      cursor = index + token.length;
      continue;
    }

    const url = trimUrlPunctuation(token);
    const trailing = token.slice(url.length);
    result += `<tg-button type="url" style="primary" url="${url}">🔗 Open link</tg-button>${trailing}`;
    cursor = index + token.length;
  }

  return result + escaped.slice(cursor);
}

function richTextBlocks(text) {
  const normalized = String(text ?? '').replace(/\r\n?/g, '\n').trim();
  if (!normalized) return '<p>No answer text is available for this entry.</p>';

  return normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
      const isUnorderedList = lines.length > 0 && lines.every((line) => /^[-•*]\s+/.test(line));
      const isOrderedList = lines.length > 0 && lines.every((line) => /^\d+[.)]\s+/.test(line));

      if (isUnorderedList) {
        return `<ul>${lines.map((line) => `<li>${richInlineText(line.replace(/^[-•*]\s+/, ''))}</li>`).join('')}</ul>`;
      }

      if (isOrderedList) {
        return `<ol>${lines.map((line) => `<li>${richInlineText(line.replace(/^\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`;
      }

      return `<p>${lines.map(richInlineText).join('<br>')}</p>`;
    })
    .join('\n');
}

function expandableAnswer(text) {
  const normalized = String(text ?? '').replace(/\r\n?/g, '\n').trim();
  if (!normalized) return '<blockquote expandable>No answer text is available for this entry.</blockquote>';

  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => block.split('\n').map((line) => richInlineText(line.trim())).join('<br>'));

  return `<blockquote expandable>${blocks.join('<br><br>')}</blockquote>`;
}

function sourceTypeLabel(item) {
  if (item.type === 'faq') return 'Telegram FAQ';
  if (item.type === 'terms') return 'Official Telegram terms';
  return 'Official Telegram guide';
}

function renderRichAnswer(item) {
  const title = item.question ?? item.title ?? 'Telegram documentation';
  const body = item.answer ?? item.content ?? '';
  const sourceUrl = item.source?.url;
  const sourceTitle = item.source?.title ?? 'Official Telegram source';
  const sourceType = sourceTypeLabel(item);

  const sourceButton = sourceUrl
    ? `<tg-button-row align="center"><tg-button type="url" style="primary" url="${htmlEscape(sourceUrl)}">📖 Official source</tg-button></tg-button-row>`
    : '';

  return [
    `<h2>❓ ${htmlEscape(title)}</h2>`,
    '<p><b>Answer</b></p>',
    expandableAnswer(body),
    '<hr/>',
    `<details><summary>About this answer</summary><p><b>Source:</b> ${htmlEscape(sourceTitle)}<br><b>Type:</b> ${htmlEscape(sourceType)}</p></details>`,
    sourceButton,
    '<footer>Telegram FAQ Bot • Official Telegram documentation only</footer>'
  ].filter(Boolean).join('\n');
}

function richMessageContent(item) {
  return {
    rich_message: {
      html: renderRichAnswer(item)
    }
  };
}

function noResultsContent() {
  return {
    rich_message: {
      html: [
        '<h2>🔎 Nothing found</h2>',
        '<p>This bot only answers questions supported by the official Telegram sources in its knowledge base.</p>',
        '<details><summary>What is covered?</summary><ul><li>Telegram FAQ</li><li>Bot FAQ and developer guides</li><li>Bot features</li><li>Official bot terms</li></ul></details>',
        '<tg-button-row align="center"><tg-button type="switch_inline_query_current_chat" style="primary" query="">🔎 Search again</tg-button></tg-button-row>',
        '<footer>Try a more specific Telegram or bot-related question.</footer>'
      ].join('\n')
    }
  };
}

function inlineResults(query) {
  const matches = searchKnowledge(query);

  if (!matches.length) {
    return [{
      type: 'article',
      id: 'no-results',
      title: 'No official answer found',
      description: 'No matching information exists in the indexed Telegram sources.',
      input_message_content: noResultsContent()
    }];
  }

  return matches.map((item, index) => {
    const title = item.question ?? item.title ?? 'Telegram documentation';
    const description = item.source?.title ? `${item.source.title} • Official` : 'Official Telegram source';

    return {
      type: 'article',
      id: item.id ?? `knowledge-${index}`,
      title,
      description,
      url: item.source?.url,
      input_message_content: richMessageContent(item)
    };
  });
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
    throw new Error(`Telegram ${method} failed: HTTP ${response.status} ${body?.description ?? ''}`.trim());
  }

  return body;
}

async function getBotProfile() {
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
    `<h1>🤖 ${htmlEscape(username)}</h1>`,
    '<p><b>Official Telegram knowledge search</b></p>',
    '<p>Ask questions about Telegram, bots, Bot API features and official bot terms. Answers come only from the official Telegram sources indexed by this bot.</p>',
    '<details><summary>How to use</summary><ol><li>Tap <b>Search Telegram</b>.</li><li>Type your Telegram-related question after the bot username.</li><li>Choose the most relevant official answer.</li></ol></details>',
    '<tg-button-row align="center"><tg-button type="switch_inline_query_current_chat" style="primary" query="">🔎 Search Telegram</tg-button></tg-button-row>',
    '<tg-button-row align="center"><tg-button type="url" style="success" url="https://core.telegram.org/bots/api">📘 Bot API</tg-button><tg-button type="url" style="primary" url="https://www.telegram.org/faq">📚 Telegram FAQ</tg-button></tg-button-row>',
    '<footer>Telegram FAQ Bot • Official Telegram documentation only</footer>'
  ].join('\n');
}

function helpMessageHtml(username) {
  return [
    `<h2>🧭 ${htmlEscape(username)} Help</h2>`,
    '<p>Use inline mode to search the official Telegram knowledge base.</p>',
    '<table bordered compact><tr><th>Command</th><th>Action</th></tr><tr><td><code>/start</code></td><td>Welcome and quick search</td></tr><tr><td><code>/help</code></td><td>Show this help</td></tr><tr><td><code>/ping</code></td><td>Service and knowledge-base status</td></tr></table>',
    '<tg-button-row align="center"><tg-button type="switch_inline_query_current_chat" style="primary" query="">🔎 Search Telegram</tg-button></tg-button-row>',
    '<footer>Answers are limited to indexed official Telegram documentation.</footer>'
  ].join('\n');
}

async function pingMessageHtml() {
  const started = performance.now();
  const profile = await getBotProfile();
  const latency = Math.max(0, Math.round(performance.now() - started));
  const username = botUsername(profile);

  return [
    '<h2>🏓 Pong!</h2>',
    `<p><b>${htmlEscape(username)}</b> is online and responding.</p>`,
    `<table bordered compact><tr><th>Metric</th><th>Status</th></tr><tr><td>Telegram API</td><td>🟢 ${latency} ms</td></tr><tr><td>Knowledge base</td><td>🟢 ${KNOWLEDGE.length} entries</td></tr><tr><td>Official sources</td><td>🟢 ${SOURCE_COUNT} sources</td></tr></table>`,
    '<details><summary>About the database</summary><p>This bot does not use a runtime database. Its knowledge base is the generated <code>data/knowledge.json</code> file shipped with the deployment.</p></details>',
    '<footer>Serverless • GitHub knowledge base • Vercel</footer>'
  ].join('\n');
}

async function sendRichMessage(chatId, html) {
  return telegram('sendRichMessage', {
    chat_id: chatId,
    rich_message: { html }
  });
}

function authorizedWebhook(req) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return true;
  return req.headers['x-telegram-bot-api-secret-token'] === expected;
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    res.status(200).json({ ok: true, service: 'telegram-faq-bot' });
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }

  if (!authorizedWebhook(req)) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return;
  }

  try {
    const update = req.body ?? {};

    if (update.inline_query) {
      await telegram('answerInlineQuery', {
        inline_query_id: update.inline_query.id,
        results: inlineResults(update.inline_query.query ?? ''),
        cache_time: 300,
        is_personal: false
      });
    } else if (update.message?.text) {
      const profile = await getBotProfile();
      const command = parseCommand(update.message.text, profile?.username);

      if (command === 'start') {
        await sendRichMessage(update.message.chat.id, startMessageHtml(botUsername(profile)));
      } else if (command === 'help') {
        await sendRichMessage(update.message.chat.id, helpMessageHtml(botUsername(profile)));
      } else if (command === 'ping') {
        await sendRichMessage(update.message.chat.id, await pingMessageHtml());
      }
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false });
  }
}
