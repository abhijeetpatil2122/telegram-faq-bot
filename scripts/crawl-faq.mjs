import fs from 'node:fs/promises';
import path from 'node:path';

const SOURCES = [
  { id: 'telegram-faq', title: 'Telegram FAQ', url: 'https://telegram.org/faq', kind: 'faq' },
  { id: 'bots-faq', title: 'Bots FAQ', url: 'https://core.telegram.org/bots/faq', kind: 'faq' },
  { id: 'bots-intro', title: 'Bots: An introduction for developers', url: 'https://core.telegram.org/bots', kind: 'guide' },
  { id: 'bot-features', title: 'Telegram Bot Features', url: 'https://core.telegram.org/bots/features', kind: 'guide' },
  { id: 'bot-developer-terms', title: 'Telegram Bot Platform Developer Terms', url: 'https://telegram.org/tos/bot-developers', kind: 'terms' },
  { id: 'bot-terms', title: 'Terms of Service for Bots', url: 'https://telegram.org/tos/bots', kind: 'terms' }
];

const USER_AGENT = 'telegram-faq-bot-crawler/1.0 (+https://github.com/abhijeetpatil2122/telegram-faq-bot)';
const root = path.resolve(process.cwd());
const faqOutput = path.join(root, 'data', 'faq.json');
const knowledgeOutput = path.join(root, 'data', 'knowledge.json');

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

function headingMatches(html) {
  return [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)];
}

function extractFaq(html, source) {
  const items = [];
  const headings = headingMatches(html);

  for (let index = 0; index < headings.length; index += 1) {
    const rawHeading = stripTags(headings[index][2]);
    if (!/^Q:\s*/i.test(rawHeading)) continue;

    const question = rawHeading.replace(/^Q:\s*/i, '').trim();
    if (question.length < 5 || question.length > 500) continue;

    const start = headings[index].index + headings[index][0].length;
    const end = headings[index + 1]?.index ?? html.length;
    const answer = stripTags(html.slice(start, end));
    if (answer.length < 20) continue;

    items.push({
      id: `${source.id}-${slug(question)}`,
      type: 'faq',
      question,
      aliases: [],
      keywords: normalize(question).split(' ').filter((word) => word.length >= 3),
      answer: answer.slice(0, 12000),
      source: { id: source.id, title: source.title, url: source.url }
    });
  }

  return items;
}

function extractGuideSections(html, source) {
  const items = [];
  const headings = headingMatches(html);

  for (let index = 0; index < headings.length; index += 1) {
    const heading = stripTags(headings[index][2]);
    if (!heading || /^Q:\s*/i.test(heading)) continue;
    if (heading.length < 3 || heading.length > 300) continue;

    const level = Number(headings[index][1]);
    if (level > 4) continue;

    const start = headings[index].index + headings[index][0].length;
    const end = headings[index + 1]?.index ?? html.length;
    const text = stripTags(html.slice(start, end));

    // Avoid indexing navigation/empty headings and extremely tiny fragments.
    if (text.length < 80) continue;

    items.push({
      id: `${source.id}-${slug(heading)}`,
      type: source.kind,
      title: heading,
      keywords: normalize(`${heading} ${text.slice(0, 1500)}`).split(' ').filter((word) => word.length >= 4).slice(0, 80),
      content: text.slice(0, 12000),
      source: { id: source.id, title: source.title, url: source.url }
    });
  }

  return items;
}

async function fetchSource(source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    const response = await fetch(source.url, {
      headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`${source.url}: HTTP ${response.status}`);
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

const faqItems = [];
const knowledgeItems = [];

for (const source of SOURCES) {
  const html = await fetchSource(source);
  const items = source.kind === 'faq'
    ? extractFaq(html, source)
    : extractGuideSections(html, source);

  if (items.length === 0) {
    throw new Error(`No knowledge entries extracted from ${source.url}`);
  }

  console.log(`${source.id}: extracted ${items.length} ${source.kind} entries`);
  knowledgeItems.push(...items);
  if (source.kind === 'faq') faqItems.push(...items);
}

const dedupe = (items, key) => [...new Map(items.map((item) => [normalize(item[key]), item])).values()]
  .sort((a, b) => a[key].localeCompare(b[key]));

const faq = {
  schemaVersion: 3,
  sources: SOURCES.filter((source) => source.kind === 'faq'),
  items: dedupe(faqItems, 'question')
};

const knowledge = {
  schemaVersion: 1,
  policy: 'Answers must be supported by official Telegram sources indexed here.',
  sources: SOURCES,
  items: knowledgeItems.sort((a, b) => a.id.localeCompare(b.id))
};

async function writeIfChanged(file, data) {
  const next = `${JSON.stringify(data, null, 2)}\n`;
  let previous = null;
  try {
    previous = await fs.readFile(file, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (previous === next) {
    console.log(`No changes: ${path.relative(root, file)}`);
    return;
  }
  await fs.writeFile(file, next);
  console.log(`Updated ${path.relative(root, file)}`);
}

await fs.mkdir(path.dirname(faqOutput), { recursive: true });
await writeIfChanged(faqOutput, faq);
await writeIfChanged(knowledgeOutput, knowledge);
console.log(`Indexed ${faq.items.length} FAQ entries and ${knowledge.items.length} total knowledge entries.`);
