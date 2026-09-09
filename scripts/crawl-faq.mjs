import fs from 'node:fs/promises';
import path from 'node:path';

const SOURCES = [
  {
    id: 'telegram-faq',
    title: 'Telegram FAQ',
    url: 'https://telegram.org/faq',
    kind: 'faq-q'
  },
  {
    id: 'bots-faq',
    title: 'Bots FAQ',
    url: 'https://core.telegram.org/bots/faq',
    kind: 'faq-h4'
  },
  {
    id: 'bots',
    title: 'Bots: An introduction for developers',
    url: 'https://core.telegram.org/bots',
    kind: 'guide'
  },
  {
    id: 'bot-features',
    title: 'Telegram Bot Features',
    url: 'https://core.telegram.org/bots/features',
    kind: 'guide'
  },
  {
    id: 'bot-developer-terms',
    title: 'Telegram Bot Developer Terms',
    url: 'https://telegram.org/tos/bot-developers',
    kind: 'terms'
  },
  {
    id: 'bot-terms',
    title: 'Telegram Bot Terms',
    url: 'https://telegram.org/tos/bots',
    kind: 'terms'
  }
];

const USER_AGENT = 'telegram-faq-bot-crawler/1.1 (+https://github.com/abhijeetpatil2122/telegram-faq-bot)';
const root = path.resolve(process.cwd());
const output = path.join(root, 'data', 'knowledge.json');

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
  return normalize(value).replace(/\s+/g, '-').slice(0, 90);
}

function keywordsFor(title, answer) {
  return [...new Set(`${normalize(title)} ${normalize(answer).slice(0, 1200)}`
    .split(' ')
    .filter((word) => word.length >= 4)
    .slice(0, 50))];
}

function extractHeadings(html) {
  const regex = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi;
  return [...html.matchAll(regex)].map((match) => ({
    level: Number(match[1]),
    raw: match[0],
    text: stripTags(match[2]),
    index: match.index ?? 0
  }));
}

function sectionEnd(headings, index, currentLevel, htmlLength) {
  for (let next = index + 1; next < headings.length; next += 1) {
    if (headings[next].level <= currentLevel) return headings[next].index;
  }
  return htmlLength;
}

function nearestSection(headings, index, maxLevel = 3) {
  for (let previous = index - 1; previous >= 0; previous -= 1) {
    if (headings[previous].level <= maxLevel && headings[previous].text) {
      return headings[previous].text;
    }
  }
  return null;
}

function makeItem(source, title, answer, section = null) {
  const cleanTitle = title.trim();
  const cleanAnswer = answer.trim();
  return {
    id: `${source.id}-${slug(cleanTitle)}`,
    type: source.kind.startsWith('faq') ? 'faq' : source.kind,
    title: cleanTitle,
    question: cleanTitle,
    section,
    aliases: [],
    keywords: keywordsFor(cleanTitle, cleanAnswer),
    answer: cleanAnswer.slice(0, 14000),
    source: { id: source.id, title: source.title, url: source.url }
  };
}

function extractFaqWithQ(html, source) {
  const items = [];
  const headings = extractHeadings(html);

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    if (!/^Q:\s*/i.test(heading.text)) continue;

    const question = heading.text.replace(/^Q:\s*/i, '').trim();
    if (question.length < 5 || question.length > 500) continue;

    const start = heading.index + heading.raw.length;
    const end = sectionEnd(headings, index, heading.level, html.length);
    const answer = stripTags(html.slice(start, end));
    if (answer.length < 20) continue;

    items.push(makeItem(source, question, answer, nearestSection(headings, index)));
  }

  return items;
}

function extractFaqHeadings(html, source) {
  const items = [];
  const headings = extractHeadings(html);

  // Bots FAQ currently uses h4 elements for individual questions and h3 for
  // category headings. Do not depend on the visible wording of questions.
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    if (heading.level !== 4) continue;
    if (!heading.text || heading.text.length < 5 || heading.text.length > 500) continue;

    const start = heading.index + heading.raw.length;
    const end = sectionEnd(headings, index, heading.level, html.length);
    const answer = stripTags(html.slice(start, end));
    if (answer.length < 20) continue;

    items.push(makeItem(source, heading.text, answer, nearestSection(headings, index, 3)));
  }

  return items;
}

function extractGuideSections(html, source) {
  const items = [];
  const headings = extractHeadings(html);

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    if (heading.level > 3) continue;
    if (!heading.text || /^Q:\s*/i.test(heading.text)) continue;

    const start = heading.index + heading.raw.length;
    const end = sectionEnd(headings, index, heading.level, html.length);
    const text = stripTags(html.slice(start, end));
    if (text.length < 80) continue;

    items.push(makeItem(source, heading.text, text, nearestSection(headings, index - 1, 2)));
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

    if (!response.ok) throw new Error(`${source.url}: HTTP ${response.status}`);
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function extractSource(html, source) {
  switch (source.kind) {
    case 'faq-q':
      return extractFaqWithQ(html, source);
    case 'faq-h4':
      return extractFaqHeadings(html, source);
    case 'guide':
    case 'terms':
      return extractGuideSections(html, source);
    default:
      throw new Error(`Unknown source parser: ${source.kind}`);
  }
}

const all = [];
const sourceStats = [];

for (const source of SOURCES) {
  const html = await fetchSource(source);
  const items = extractSource(html, source);

  if (items.length === 0) {
    throw new Error(`No knowledge entries extracted from ${source.url}`);
  }

  console.log(`${source.id}: extracted ${items.length} ${source.kind} entries`);
  sourceStats.push({ id: source.id, entriesExtracted: items.length });
  all.push(...items);
}

// Avoid duplicate questions appearing twice in inline search. When the same
// title exists in multiple official sources, retain the richer answer.
const byTitle = new Map();
for (const item of all) {
  const key = normalize(item.title);
  const existing = byTitle.get(key);
  if (!existing || item.answer.length > existing.answer.length) {
    byTitle.set(key, item);
  }
}

const unique = [...byTitle.values()]
  .sort((a, b) => a.title.localeCompare(b.title));

const data = {
  schemaVersion: 1,
  policy: 'Answers must be supported by official Telegram sources indexed here.',
  sources: SOURCES,
  sourceStats,
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
