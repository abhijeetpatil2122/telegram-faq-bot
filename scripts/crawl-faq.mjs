import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';

const SOURCES = [
  { id: 'telegram-faq', title: 'Telegram FAQ', url: 'https://telegram.org/faq', kind: 'faq-q' },
  { id: 'bots-faq', title: 'Bots FAQ', url: 'https://core.telegram.org/bots/faq', kind: 'faq-h4' },
  { id: 'bots', title: 'Bots: An introduction for developers', url: 'https://core.telegram.org/bots', kind: 'guide' },
  { id: 'bot-features', title: 'Telegram Bot Features', url: 'https://core.telegram.org/bots/features', kind: 'guide' },
  { id: 'bot-developer-terms', title: 'Telegram Bot Developer Terms', url: 'https://telegram.org/tos/bot-developers', kind: 'terms' },
  { id: 'bot-terms', title: 'Telegram Bot Terms', url: 'https://telegram.org/tos/bots', kind: 'terms' }
];

const USER_AGENT = 'telegram-faq-bot-crawler/3.0 (+https://github.com/abhijeetpatil2122/telegram-faq-bot)';
const MAX_ANSWER_CHARS = 28000;
const root = path.resolve(process.cwd());
const output = path.join(root, 'data', 'knowledge.json');

const STOPWORDS = new Set([
  'about', 'after', 'again', 'against', 'also', 'and', 'are', 'because', 'before', 'being',
  'been', 'between', 'both', 'but', 'can', 'cannot', 'could', 'did', 'does', 'doesn',
  'doing', 'during', 'each', 'for', 'from', 'further', 'had', 'has', 'have', 'having',
  'here', 'how', 'into', 'is', 'isn', 'it', 'its', 'just', 'may', 'might', 'more', 'most',
  'must', 'not', 'now', 'of', 'on', 'only', 'or', 'other', 'our', 'ours', 'over', 'same',
  'shall', 'should', 'so', 'some', 'such', 'than', 'that', 'their', 'theirs', 'them',
  'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'under', 'until',
  'very', 'was', 'wasn', 'we', 'were', 'weren', 'what', 'when', 'where', 'which', 'while',
  'who', 'whom', 'why', 'will', 'with', 'won', 'would', 'wouldn', 'you', 'your', 'yours',
  'telegram'
]);

const SHORT_KEYWORDS = new Set(['api', 'app', 'bot', 'bots', 'faq', 'tpa', 'url', 'otp']);

const RICH_INLINE_TAGS = new Set([
  'b', 'strong', 'i', 'em', 'u', 'ins', 's', 'strike', 'del', 'code', 'mark', 'sub', 'sup',
  'tg-spoiler', 'tg-reference', 'tg-emoji', 'tg-time', 'tg-math', 'a'
]);

const RICH_BLOCK_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'pre', 'footer', 'hr', 'ul', 'ol', 'li',
  'blockquote', 'aside', 'figure', 'figcaption', 'cite', 'table', 'caption', 'tr', 'th',
  'td', 'details', 'summary'
]);

function normalize(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanText(value = '') {
  return String(value)
    .replace(/\u00a0/g, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTitle(value = '') {
  return cleanText(value).replace(/^Q:\s*/i, '').replace(/\s+[#§]+\s*$/g, '').trim();
}

function safeId(sourceId, title) {
  const digest = createHash('sha256').update(`${sourceId}\n${title}`).digest('hex').slice(0, 20);
  return `${sourceId}-${digest}`;
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function normalizeTextNode(value, preserveWhitespace = false) {
  const text = String(value ?? '').replace(/[\u200B-\u200D\uFEFF]/g, '');
  if (preserveWhitespace) return escapeHtml(text);
  return escapeHtml(text.replace(/\s+/g, ' '));
}

function safeUrl(value, baseUrl) {
  const raw = String(value ?? '').trim();
  if (!raw || /^(?:javascript|data|vbscript):/i.test(raw)) return null;

  try {
    const url = new URL(raw, baseUrl);
    if (!['http:', 'https:', 'mailto:', 'tel:', 'tg:'].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function attr(node, name) {
  return node.attribs?.[name] ?? null;
}

function attrsFor(tag, node, sourceUrl) {
  const attrs = [];

  if (tag === 'a') {
    const href = safeUrl(attr(node, 'href'), sourceUrl);
    const name = attr(node, 'name');
    if (href) attrs.push(`href="${escapeHtml(href)}"`);
    if (name) attrs.push(`name="${escapeHtml(name)}"`);
  }

  if (tag === 'tg-reference' && attr(node, 'name')) attrs.push(`name="${escapeHtml(attr(node, 'name'))}"`);
  if (tag === 'tg-emoji' && attr(node, 'emoji-id')) attrs.push(`emoji-id="${escapeHtml(attr(node, 'emoji-id'))}"`);
  if (tag === 'tg-time') {
    for (const name of ['unix', 'format']) {
      if (attr(node, name)) attrs.push(`${name}="${escapeHtml(attr(node, name))}"`);
    }
  }

  if (tag === 'ol') {
    for (const name of ['start', 'type']) {
      if (attr(node, name)) attrs.push(`${name}="${escapeHtml(attr(node, name))}"`);
    }
    if (attr(node, 'reversed') !== null) attrs.push('reversed');
  }

  if (tag === 'li') {
    for (const name of ['value', 'type']) {
      if (attr(node, name)) attrs.push(`${name}="${escapeHtml(attr(node, name))}"`);
    }
  }

  if (tag === 'ul' || tag === 'ol') {
    if (attr(node, 'class')?.toLowerCase().includes('task')) {
      // Task-list state is preserved on its input elements below.
    }
  }

  if (tag === 'input' && String(attr(node, 'type')).toLowerCase() === 'checkbox') {
    attrs.push('type="checkbox"');
    if (attr(node, 'checked') !== null) attrs.push('checked');
  }

  if (tag === 'table') {
    for (const name of ['bordered', 'striped', 'compact']) {
      if (attr(node, name) !== null || String(attr(node, 'class') ?? '').toLowerCase().includes(name)) attrs.push(name);
    }
  }

  if (tag === 'td' || tag === 'th') {
    for (const name of ['colspan', 'rowspan', 'align', 'valign']) {
      if (attr(node, name)) attrs.push(`${name}="${escapeHtml(attr(node, name))}"`);
    }
  }

  if (tag === 'details' && attr(node, 'open') !== null) attrs.push('open');
  if (tag === 'img' || tag === 'video' || tag === 'audio') {
    const src = safeUrl(attr(node, 'src'), sourceUrl);
    if (src) attrs.push(`src="${escapeHtml(src)}"`);
    if (attr(node, 'alt')) attrs.push(`alt="${escapeHtml(attr(node, 'alt'))}"`);
  }

  return attrs.length ? ` ${attrs.join(' ')}` : '';
}

function renderNode(node, $, sourceUrl, context = {}) {
  if (node.type === 'text') return normalizeTextNode(node.data, Boolean(context.preserveWhitespace));
  if (node.type !== 'tag') return '';

  const tag = String(node.name ?? '').toLowerCase();
  const children = () => $(node).contents().toArray().map((child) => renderNode(child, $, sourceUrl, context)).join('');

  if (tag === 'br') return '\n';
  if (tag === 'wbr') return '';

  if (tag === 'img' || tag === 'video' || tag === 'audio') {
    const src = safeUrl(attr(node, 'src'), sourceUrl);
    const label = cleanText(attr(node, 'alt') || attr(node, 'title') || 'Media');
    return src ? `<a href="${escapeHtml(src)}">🖼️ ${escapeHtml(label)}</a>` : '';
  }

  if (tag === 'input') {
    return String(attr(node, 'type')).toLowerCase() === 'checkbox' ? `<input${attrsFor('input', node, sourceUrl)}/>` : '';
  }

  if (!RICH_INLINE_TAGS.has(tag) && !RICH_BLOCK_TAGS.has(tag)) {
    return children();
  }

  if (context.tableCell && ['p', 'div', 'section', 'article', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) {
    return children();
  }

  const preserveWhitespace = tag === 'pre';
  const inner = $(node).contents().toArray().map((child) => renderNode(child, $, sourceUrl, { ...context, preserveWhitespace })).join('');

  if (tag === 'hr') return '<hr/>';
  if (tag === 'a' && !attr(node, 'href') && !attr(node, 'name')) return inner;

  const attrs = attrsFor(tag, node, sourceUrl);
  const selfClosing = tag === 'a' && attr(node, 'name') && !inner;
  if (selfClosing) return `<a${attrs}></a>`;

  return `<${tag}${attrs}>${inner}</${tag}>`;
}

function renderRichHtml(nodes, $, sourceUrl) {
  return nodes
    .map((node) => renderNode(node, $, sourceUrl))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function plainTextFromHtml(html) {
  const $ = cheerio.load(`<div id="root">${html}</div>`, { decodeEntities: true }, false);
  return cleanText($('#root').text());
}

function keywordsFor(title, answer) {
  const words = `${normalize(title)} ${normalize(answer).slice(0, 5000)}`
    .split(' ')
    .filter((word) => (word.length >= 3 || SHORT_KEYWORDS.has(word)) && !STOPWORDS.has(word));
  return [...new Set(words)].slice(0, 100);
}

function chooseContentRoot($) {
  const selectors = ['main', 'article', '#dev_page_content', '#dev_page_content_wrap', '.dev_page_content_wrap', '.dev_page_content', 'body'];
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
    'script, style, noscript, template, svg, nav, header, aside, ' +
    '[role="navigation"], [aria-label*="navigation" i], ' +
    '[class*="footer" i], [id*="footer" i], [class*="sidebar" i], [id*="sidebar" i], ' +
    '[class*="dev_page_nav" i], [id*="dev_page_nav" i], [class*="breadcrumb" i], [id*="breadcrumb" i]'
  ).remove();

  return { $, root: chooseContentRoot($) };
}

function contentNodes(root) {
  const selectors = 'h1,h2,h3,h4,h5,h6,p,ul,ol,pre,blockquote,figure,table,details,hr,dl';
  const all = root.find(selectors).toArray();
  const selected = new Set(all);

  return all.filter((node) => {
    let parent = node.parent;
    while (parent) {
      if (selected.has(parent)) return false;
      parent = parent.parent;
    }
    return true;
  });
}

function isHeading(node) {
  return /^h[1-6]$/i.test(node.name ?? '');
}

function extractSections(html, source, headingFilter) {
  const { $, root } = loadDocument(html);
  const nodes = contentNodes(root);
  const headings = [];

  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    if (!isHeading(node)) continue;
    const rawText = cleanText($(node).text());
    headings.push({ index, level: Number(node.name.slice(1)), rawText, text: cleanTitle(rawText) });
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

    const answerNodes = nodes.slice(heading.index + 1, end);
    const answerHtml = renderRichHtml(answerNodes, $, source.url);
    const answer = plainTextFromHtml(answerHtml);
    if (answer.length < 20) continue;

    let section = null;
    for (let previous = headingPosition - 1; previous >= 0; previous -= 1) {
      if (headings[previous].level < heading.level && headings[previous].text) {
        section = headings[previous].text;
        break;
      }
    }

    items.push(makeItem(source, heading.text, answerHtml, answer, section));
  }

  return items;
}

function makeItem(source, title, answerHtml, answer, section = null) {
  const cleanTitleValue = cleanTitle(title);
  const limitedHtml = answerHtml.slice(0, MAX_ANSWER_CHARS);
  const limitedAnswer = plainTextFromHtml(limitedHtml).slice(0, MAX_ANSWER_CHARS);

  return {
    id: safeId(source.id, cleanTitleValue),
    type: source.kind.startsWith('faq') ? 'faq' : source.kind,
    title: cleanTitleValue,
    question: cleanTitleValue,
    section,
    aliases: [],
    keywords: keywordsFor(cleanTitleValue, limitedAnswer),
    answer: limitedAnswer,
    answer_html: limitedHtml,
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
      return extractSections(html, source, ({ level, text }) => level >= 2 && level <= 4 && text.length >= 5 && text.length <= 500);
    default:
      throw new Error(`Unknown source parser: ${source.kind}`);
  }
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

const all = [];
const sourceStats = [];

for (const source of SOURCES) {
  const html = await fetchSource(source);
  const items = extractSource(html, source);
  if (items.length === 0) throw new Error(`No knowledge entries extracted from ${source.url}`);

  console.log(`${source.id}: extracted ${items.length} entries with rich HTML preservation`);
  sourceStats.push({ id: source.id, entriesExtracted: items.length });
  all.push(...items);
}

const bySourceAndTitle = new Map();
for (const item of all) {
  const key = `${item.source.id}::${normalize(item.title)}`;
  const existing = bySourceAndTitle.get(key);
  if (!existing || item.answer.length > existing.answer.length) bySourceAndTitle.set(key, item);
}

const unique = [...bySourceAndTitle.values()].sort((a, b) =>
  a.source.id.localeCompare(b.source.id) || a.title.localeCompare(b.title)
);

for (const stat of sourceStats) {
  stat.entriesIndexed = unique.filter((item) => item.source.id === stat.id).length;
}

const data = {
  schemaVersion: 2,
  policy: 'Answers must be supported by official Telegram sources indexed here.',
  format: 'answer_html contains sanitized Telegram Rich HTML derived from the official source HTML.',
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
