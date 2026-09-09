import fs from 'node:fs';
import path from 'node:path';

const FAQ_PATH = path.join(process.cwd(), 'data', 'faq.json');
const MAX_RESULTS = 10;

function loadFaq() {
  try {
    const data = JSON.parse(fs.readFileSync(FAQ_PATH, 'utf8'));
    return Array.isArray(data.items) ? data.items : [];
  } catch (error) {
    console.error('Unable to load FAQ dataset:', error);
    return [];
  }
}

function normalize(value = '') {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function score(item, query) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return 0;

  const queryTokens = normalizedQuery.split(' ').filter((token) => token.length >= 2);
  const fields = [item.question, ...(item.aliases ?? []), ...(item.keywords ?? [])]
    .filter(Boolean)
    .map(normalize);

  let points = 0;

  for (const field of fields) {
    if (field === normalizedQuery) points += 150;
    else if (field.startsWith(normalizedQuery)) points += 90;
    else if (field.includes(normalizedQuery)) points += 60;

    for (const token of queryTokens) {
      if (field.includes(token)) points += 8;
    }
  }

  // Reward answers whose question contains most of the query terms.
  const question = normalize(item.question);
  const matchedTokens = queryTokens.filter((token) => question.includes(token)).length;
  points += matchedTokens * 12;

  return points;
}

function searchFaq(query) {
  const items = loadFaq();

  if (!normalize(query)) {
    return items.slice(0, MAX_RESULTS);
  }

  return items
    .map((item) => ({ item, score: score(item, query) }))
    .filter(({ score: itemScore }) => itemScore > 0)
    .sort((a, b) => b.score - a.score || a.item.question.localeCompare(b.item.question))
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

function renderAnswer(item) {
  const answer = htmlEscape(item.answer ?? '');
  const sourceUrl = item.source?.url;
  const source = sourceUrl
    ? `\n\n<a href="${htmlEscape(sourceUrl)}">📖 Official Telegram source</a>`
    : '';

  return `<b>❓ ${htmlEscape(item.question)}</b>\n\n${answer}${source}`;
}

function inlineResults(query) {
  const matches = searchFaq(query);

  if (!matches.length) {
    return [{
      type: 'article',
      id: 'no-results',
      title: 'No official answer found',
      description: 'No matching entry exists in the official Telegram FAQ dataset.',
      input_message_content: {
        message_text: '<b>Nothing found</b>\n\nThis bot only answers questions supported by its official Telegram sources.',
        parse_mode: 'HTML'
      }
    }];
  }

  return matches.map((item, index) => ({
    type: 'article',
    id: item.id ?? `faq-${index}`,
    title: item.question,
    description: item.source?.title ? `${item.source.title} • Official` : 'Official Telegram source',
    input_message_content: {
      message_text: renderAnswer(item),
      parse_mode: 'HTML',
      disable_web_page_preview: true
    }
  }));
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
        text: 'Use this bot in inline mode to search official Telegram FAQ answers.\n\nType @your_bot_name followed by a question.',
        disable_web_page_preview: true
      });
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false });
  }
}
