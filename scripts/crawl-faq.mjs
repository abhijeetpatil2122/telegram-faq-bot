import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';

const SOURCES = [
  { id: 'telegram-faq', title: 'Telegram FAQ', url: 'https://telegram.org/faq', kind: 'faq-q' },
  { id: 'bots-faq', title: 'Bots FAQ', url: 'https://core.telegram.org/bots/faq', kind: 'faq-h4' },
  { id: 'bots', title: 'Bots: An introduction for developers', url: 'https://core.telegram.org/bots', kind: 'guide' },
  { id: 'bot-features', title: 'Telegram Bot Features', url: 'https://core.telegram.org/bots/features', kind: 'guide' },
  { id: 'bot-developer-terms', title: 'Telegram Bot Developer Terms', url: 'https://telegram.org/tos/bot-developers', kind: 'terms' },
  { id: 'bot-terms', title: 'Telegram Bot Terms', url: 'https://telegram.org/tos/bots', kind: 'terms' }
];

const USER_AGENT = 'telegram-faq-bot-crawler/2.0 (+https://github.com/abhijeetpatil2122/telegram-faq-bot)';
const root = path.resolve(process.cwd());
const output = path.join(root, 'data', 'knowledge.json');

const STOPWORDS = new Set([
  'about', 'after', 'again', 'against', 'also', 'and', 'are', 'because', 'before', 'being',
  'been', 'between', 'both', 'but', 'can', 'cannot', 'could', 'did', 'does', 'doesn',
  'doing', 'during', 'each', 'for', 'from', 'further', 'had', 'has', 'have', 'having',
  'here', 'how', 'into', 'is', 'isn', 'it', 'its', 'just', 'may', 'might', 'more', 'most',
  'must', 'not', 'now', 'of', 'on', 'only', 'or', 'other', 'our', 'ours', 'over', 'same',
  'shall', 'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs',
  'them', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'under',
  'until', 'very', 'was', 'wasn', 'we', 'were', 'weren', 'what', 'when', 'where', 'which',
  'while', 'who', 'whom', 'why', 'will', 'with', 'won', 'would', 'wouldn', 'you', 'your',
  'yours', 'telegram'
]);

const SHORT_KEYWORDS = new Set(['api', 'app', 'bot', 'bots', 'faq', 'tpa']);

function normalize(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slug(value = '') {
  return normalize(value).replace(/\s+/g, '-').slice(0, 90);
}

function cleanText(value = '') {
  return String(value)
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/<a\b[^>]*>\s*<\/a>/gi, ' ')
    .replace(/<a\b[^>]*\/\s*>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTitle(value = '') {
  return cleanText(value)
    .replace(/^Q:\s*/i, '')
    .replace(/\s+[#§]+\s*$/g, '')
    .trim();
}

function cleanAnswer(parts = []) {
  const lines = [];
  for (const part of parts) {
    const text = cleanText(part);
    if (!text) continue;
    if (lines.at(-1) === text) continue;
    lines.push(text);
  }
  return lines.join('\n\n').trim();
}

function keywordsFor(title, answer) {
  const words = `${normalize(title)} ${normalize(answer).slice(0, 1800)}`
    .split(' ')
    .filter((word) => (word.length >= 4 || SHORT_KEYWORDS.has(word)) && !STOPWORDS.has(word));

  return [...new Set(words)].slice(0, 50);
}

function chooseContentRoot($) {
  const selectors = [
    'main',
    'article',
    '#dev_page_content',
    '#dev_page_content_wrap',
    '.dev_page_content_wrap',
    '.dev_page_content',
    'body'
  ];

  let best = $('body');
  let bestCount = 0;

  for (const selector of selectors) {
    $(selector).each((_, element) => {
      const count = $(element).find('h1,h2,h3,h4,h5,h6').length;
      if (count > bestCount) {
        best = $(element);
        bestCount = count;
      }
    });
  }

  return best;
}

function loadDocument(html) {
  const $ = cheerio.load(html, { decodeEntities: true });

  $(
    'script, style, noscript, template, svg, nav, footer, header, aside, ' +
    '[role="navigation"], [aria-label*="navigation" i], ' +
    '[class*="footer" i], [id*="footer" i], [class*="sidebar" i], [id*="sidebar" i], ' +
    '[class*="dev_page_nav" i], [id*="dev_page_nav" i], ' +
    '[class*="breadcrumb" i], [id*="breadcrumb" i]'
  ).remove();

  return { $, root: chooseContentRoot($) };
}

function sectionBlocks(headingIndex, nextHeadingIndex, nodes, $) {
  return nodes
    .slice(headingIndex + 1, nextHeadingIndex)
    .filter((node) => !/^h[1-6]$/i.test(node.name))
    .map((node) => $(node).text());
}

function extractSections(html, source, headingFilter) {
  const { $, root } = loadDocument(html);
  const nodes = root.find('h1,h2,h3,h4,h5,h6,p,li,pre,blockquote,dt,dd,tr').toArray();
  const headings = [];

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (/^h[1-6]$/i.test(node.name)) {
      const rawText = cleanText($(node).text());
      headings.push({ index, level: Number(node.name.slice(1)), rawText, text: cleanTitle(rawText) });
    }
  }

  const items = [];

  for (let headingPosition = 0; headingPosition < headings.length; headingPosition += 1) {
    const heading = headings[headingPosition];
    if (!headingFilter(heading)) continue;

    let end = nodes.length;
    for (let next = headingPosition + 1; next < headings.length; next += 1) {
      if (headings[next].level <= heading.level) {
        end = headings[next].index;
        break;
      }
    }

    const answer = cleanAnswer(sectionBlocks(heading.index, end, nodes, $));
    if (answer.length < 20) continue;

    let section = null;
    for (let previous = headingPosition - 1; previous >= 0; previous -= 1) {
      if (headings[previous].level < heading.level && headings[previous].text) {
        section = headings[previous].text;
        break;
      }
    }

    items.push(makeItem(source, heading.text, answer, section));
  }

  return items;
}

function makeItem(source, title, answer, section = null) {
  const cleanTitleValue = cleanTitle(title);
  const cleanAnswerValue = cleanAnswer([answer]);

  return {
    id: `${source.id}-${slug(cleanTitleValue)}`,
    type: source.kind.startsWith('faq') ? 'faq' : source.kind,
    title: cleanTitleValue,
    question: cleanTitleValue,
    section,
    aliases: [],
    keywords: keywordsFor(cleanTitleValue, cleanAnswerValue),
    answer: cleanAnswerValue.slice(0, 14000),
    source: { id: source.id, title: source.title, url: source.url }
  };
}

function extractSource(html, source) {
  switch (source.kind) {
    case 'faq-q':
      return extractSections(html, source, ({ level, rawText }) => level >= 2 && /^Q:\s*/i.test(rawText));
    case 'faq-h4':
      return extractSections(html, source, ({ level, text }) => level === 4 && text.length >= 5 && text.length <= 500);
    case 'guide':
    case 'terms':
      return extractSections(html, source, ({ level, text }) => level >= 2 && level <= 3 && text.length >= 5 && text.length <= 500);
    default:
      throw new Error(`Unknown source parser: ${source.kind}`);
  }
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

const all = [];
const sourceStats = [];

for (const source of SOURCES) {
  const html = await fetchSource(source);
  const items = extractSource(html, source);

  if (items.length === 0) throw new Error(`No knowledge entries extracted from ${source.url}`);

  console.log(`${source.id}: extracted ${items.length} ${source.kind} entries`);
  sourceStats.push({ id: source.id, entriesExtracted: items.length });
  all.push(...items);
}

const byTitle = new Map();
for (const item of all) {
  const key = normalize(item.title);
  const existing = byTitle.get(key);
  if (!existing || item.answer.length > existing.answer.length) byTitle.set(key, item);
}

const unique = [...byTitle.values()].sort((a, b) => a.title.localeCompare(b.title));

for (const stat of sourceStats) {
  stat.entriesIndexed = unique.filter((item) => item.source.id === stat.id).length;
}

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
