import fs from 'node:fs/promises';
import path from 'node:path';

const SOURCES = [
  { url: 'https://telegram.org/faq', id: 'telegram-faq', category: 'Telegram FAQ' },
  { url: 'https://core.telegram.org/bots/faq', id: 'bots-faq', category: 'Bots FAQ' },
  { url: 'https://core.telegram.org/bots', id: 'bots', category: 'Bot documentation' }
];

const root = path.resolve(process.cwd());
const output = path.join(root, 'data', 'faq.json');

function clean(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function stripTags(html) {
  return clean(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
  );
}

function extractFaq(html, source) {
  // First implementation intentionally uses conservative extraction. We only create
  // entries when a page exposes a recognizable heading/question followed by content.
  // The parser will be tightened against Telegram's current DOM before production.
  const items = [];
  const headingRegex = /<(h[2-4])[^>]*>([\s\S]*?)<\/\1>/gi;
  const headings = [...html.matchAll(headingRegex)];

  for (let i = 0; i < headings.length; i++) {
    const question = stripTags(headings[i][2]);
    if (!question || question.length < 8 || question.length > 300) continue;

    const start = headings[i].index + headings[i][0].length;
    const end = headings[i + 1]?.index ?? Math.min(start + 4000, html.length);
    const answer = stripTags(html.slice(start, end));
    if (!answer || answer.length < 20) continue;

    items.push({
      id: `${source.id}-${items.length + 1}`,
      question,
      aliases: [],
      keywords: [],
      answer: answer.slice(0, 4000),
      category: source.category,
      source: { title: source.category, url: source.url }
    });
  }

  return items;
}

const all = [];
for (const source of SOURCES) {
  const response = await fetch(source.url, { headers: { 'user-agent': 'telegram-faq-bot-crawler/1.0' } });
  if (!response.ok) throw new Error(`${source.url}: HTTP ${response.status}`);
  const html = await response.text();
  all.push(...extractFaq(html, source));
}

const unique = [...new Map(all.map((item) => [item.question.toLowerCase(), item])).values()];
const data = {
  version: 1,
  generatedAt: new Date().toISOString(),
  sources: SOURCES,
  items: unique
};

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Generated ${unique.length} FAQ entries.`);
