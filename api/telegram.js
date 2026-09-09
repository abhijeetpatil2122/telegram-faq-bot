import fs from 'node:fs';
import path from 'node:path';

const KNOWLEDGE_PATH = path.join(process.cwd(), 'data', 'knowledge.json');
const MAX_RESULTS = 10;
const MIN_SCORE = 24;

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
    .replaceAll('"', '&quot;');
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
        return `<ul>${lines.map((line) => `<li>${htmlEscape(line.replace(/^[-•*]\s+/, ''))}</li>`).join('')}</ul>`;
      }

      if (isOrderedList) {
        return `<ol>${lines.map((line) => `<li>${htmlEscape(line.replace(/^\d+[.)]\s+/, ''))}</li>`).join('')}</ol>`;
      }

      return `<p>${lines.map(htmlEscape).join('<br>')}</p>`;
    })
    .join('\n');
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
    richTextBlocks(body),
    '<hr>',
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
        '<h2>Nothing found</h2>',
        '<p>This bot only answers questions supported by the official Telegram sources in its knowledge base.</p>',
        '<details><summary>What is covered?</summary><ul><li>Telegram FAQ</li><li>Bot FAQ and developer guides</li><li>Bot features</li><li>Official bot terms</li></ul></details>',
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
    } else if (update.message?.text === '/start' || update.message?.text === '/help') {
      await telegram('sendMessage', {
        chat_id: update.message.chat.id,
        text: 'Use this bot in inline mode to search official Telegram FAQ, bot guides and bot-related terms.\n\nType @your_bot_name followed by a question.',
        disable_web_page_preview: true
      });
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false });
  }
}
