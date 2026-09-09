import fs from 'node:fs';
import path from 'node:path';

const KNOWLEDGE_PATH = path.join(process.cwd(), 'data', 'knowledge.json');
const MAX_RESULTS = 10;

function loadKnowledge() {
  try {
    const data = JSON.parse(fs.readFileSync(KNOWLEDGE_PATH, 'utf8'));
    return Array.isArray(data.items) ? data.items : [];
  } catch (error) {
    console.error('Unable to load knowledge dataset:', error);
    return [];
  }
}

function normalize(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
  if (!normalizedQuery) return 0;

  const queryTokens = normalizedQuery.split(' ').filter((token) => token.length >= 2);
  const fields = searchableText(item);
  let points = 0;

  for (const field of fields) {
    if (field === normalizedQuery) points += 180;
    else if (field.startsWith(normalizedQuery)) points += 100;
    else if (field.includes(normalizedQuery)) points += 65;

    for (const token of queryTokens) {
      if (field.includes(token)) points += 7;
    }
  }

  const primary = normalize(item.question ?? item.title ?? '');
  const matchedTokens = queryTokens.filter((token) => primary.includes(token)).length;
  points += matchedTokens * 15;

  return points;
}

function searchKnowledge(query) {
  const items = loadKnowledge();
  if (!normalize(query)) return items.slice(0, MAX_RESULTS);

  return items
    .map((item) => ({ item, score: score(item, query) }))
    .filter(({ score: itemScore }) => itemScore > 0)
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

function sourceLink(item) {
  const url = item.source?.url;
  return url ? `\n\n<a href="${htmlEscape(url)}">📖 Official Telegram source</a>` : '';
}

function renderAnswer(item) {
  const title = item.question ?? item.title ?? 'Telegram documentation';
  const body = item.answer ?? item.content ?? '';
  const type = item.type === 'faq' ? 'FAQ' : item.type === 'terms' ? 'Official terms' : 'Official guide';

  return `<b>❓ ${htmlEscape(title)}</b>\n\n${htmlEscape(body)}\n\n<i>Source type: ${htmlEscape(type)}</i>${sourceLink(item)}`;
}

function inlineResults(query) {
  const matches = searchKnowledge(query);

  if (!matches.length) {
    return [{
      type: 'article',
      id: 'no-results',
      title: 'No official answer found',
      description: 'No matching information exists in the indexed Telegram sources.',
      input_message_content: {
        message_text: '<b>Nothing found</b>\n\nThis bot only answers questions supported by its official Telegram documentation and terms.',
        parse_mode: 'HTML'
      }
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
      input_message_content: {
        message_text: renderAnswer(item),
        parse_mode: 'HTML',
        disable_web_page_preview: true
      }
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
