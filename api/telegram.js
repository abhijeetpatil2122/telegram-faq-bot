import fs from 'node:fs';
import path from 'node:path';

const FAQ_PATH = path.join(process.cwd(), 'data', 'faq.json');

function loadFaq() {
  try {
    return JSON.parse(fs.readFileSync(FAQ_PATH, 'utf8')).items ?? [];
  } catch {
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
  const q = normalize(query);
  if (!q) return 0;

  const fields = [item.question, ...(item.aliases ?? []), ...(item.keywords ?? [])]
    .filter(Boolean)
    .map(normalize);

  let points = 0;
  for (const field of fields) {
    if (field === q) points += 100;
    else if (field.includes(q)) points += 60;
    else {
      for (const token of q.split(' ')) {
        if (token.length >= 2 && field.includes(token)) points += 8;
      }
    }
  }

  return points;
}

function searchFaq(query) {
  return loadFaq()
    .map((item) => ({ item, score: score(item, query) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map(({ item }) => item);
}

function htmlEscape(value = '') {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function renderAnswer(item) {
  const answer = htmlEscape(item.answer ?? '');
  const source = item.source?.url
    ? `\n\n<a href="${htmlEscape(item.source.url)}">📖 Official Telegram source</a>`
    : '';
  return `<b>❓ ${htmlEscape(item.question)}</b>\n\n${answer}${source}`;
}

function inlineResults(query) {
  const matches = searchFaq(query);

  if (!matches.length) {
    return [{
      type: 'article',
      id: 'no-results',
      title: 'No official FAQ found',
      description: 'No matching entry was found in the curated Telegram FAQ database.',
      input_message_content: {
        message_text: '<b>Nothing found</b>\n\nThis bot only answers questions covered by its official Telegram sources.'
      }
    }];
  }

  return matches.map((item, index) => ({
    type: 'article',
    id: item.id ?? `faq-${index}`,
    title: item.question,
    description: item.category ? `${item.category} • Official Telegram source` : 'Official Telegram source',
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

  if (!response.ok) throw new Error(`Telegram HTTP ${response.status}`);
  return response.json();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(200).json({ ok: true, service: 'telegram-faq-bot' });
    return;
  }

  try {
    const update = req.body ?? {};

    if (update.inline_query) {
      const query = update.inline_query.query ?? '';
      await telegram('answerInlineQuery', {
        inline_query_id: update.inline_query.id,
        results: inlineResults(query),
        cache_time: 300,
        is_personal: false
      });
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false });
  }
}
