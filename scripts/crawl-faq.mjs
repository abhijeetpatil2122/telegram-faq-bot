import fs from 'node:fs/promises';
import path from 'node:path';

const SOURCES = [
  {
    id: 'telegram-faq',
    title: 'Telegram FAQ',
    url: 'https://telegram.org/faq',
    kind: 'faq'
  },
  {
    id: 'bots-faq',
    title: 'Bots FAQ',
    url: 'https://core.telegram.org/bots/faq',
    kind: 'faq'
  }
];

const USER_AGENT = 'telegram-faq-bot-crawler/1.0 (+https://github.com/abhijeetpatil2122/telegram-faq-bot)';
const root = path.resolve(process.cwd());
const output = path.join(root, 'data', 'faq.json');

function decodeHtml(value = '') {
  return value
    .replace(/&#(x?[0-9a-f]+);/gi, (_, code) => {
      const numeric = code.toLowerCase().startsWith('x')
        ? Number.parseInt(code.slice(1), 16)
        : Number.parseInt(code, 10);
      return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : _;
    })
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripTags(value = '') {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/\s+/g, ' ')
    .trim();
}

function normalize(value = '') {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slug(value = '') {
  return normalize(value).replace(/\s+/g, '-').slice(0, 80);
}

function extractFaq(html, source) {
  const items = [];
  const headingRegex = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  const headings = [...html.matchAll(headingRegex)];

  for (let index = 0; index < headings.length; index += 1) {
    const heading = stripTags(headings[index][2]);
    const question = heading.replace(/^Q:\s*/i, '').trim();

    // Telegram's FAQ pages mark questions with Q:. This deliberately avoids
    // treating ordinary documentation headings as questions.
    if (!/^Q:\s*/i.test(heading)) continue;
    if (question.length < 5 || question.length > 500) continue;

    const start = headings[index].index + headings[index][0].length;
    const end = headings[index + 1]?.index ?? html.length;
    const answer = stripTags(html.slice(start, end));
    if (answer.length < 20) continue;

    items.push({
      id: `${source.id}-${slug(question)}`,
      question,
      aliases: [],
      keywords: normalize(question).split(' ').filter((word) => word.length >= 3),
      answer: answer.slice(0, 12000),
      source: {
        id: source.id,
        title: source.title,
        url: source.url
      }
    });
  }

  return items;
}

async function fetchSource(source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(source.url, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml'
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`${source.url}: HTTP ${response.status}`);
    }

    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

const all = [];

for (const source of SOURCES) {
  const html = await fetchSource(source);
  const items = extractFaq(html, source);

  // Never allow a parser regression or an outage to silently replace a source
  // with an empty dataset.
  if (items.length === 0) {
    throw new Error(`No FAQ entries extracted from ${source.url}`);
  }

  console.log(`${source.id}: extracted ${items.length} entries`);
  all.push(...items);
}

const unique = [...new Map(all.map((item) => [normalize(item.question), item])).values()]
  .sort((a, b) => a.question.localeCompare(b.question));

const data = {
  schemaVersion: 2,
  sources: SOURCES,
  items: unique
};

await fs.mkdir(path.dirname(output), { recursive: true });
const next = `${JSON.stringify(data, null, 2)}\n`;

let previous = null;
try {
  previous = await fs.readFile(output, 'utf8');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

if (previous === next) {
  console.log(`No data changes. ${unique.length} entries remain.`);
} else {
  await fs.writeFile(output, next);
  console.log(`Updated ${output} with ${unique.length} entries.`);
}
