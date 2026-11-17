import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';

const root = path.resolve(process.cwd());
const configDir = path.join(root, 'config');
const dataDir = path.join(root, 'data');
const sourcesConfig = JSON.parse(await fs.readFile(path.join(configDir, 'sources.json'), 'utf8'));
const crawlerConfig = JSON.parse(await fs.readFile(path.join(configDir, 'crawler.json'), 'utf8'));
const searchConfig = JSON.parse(await fs.readFile(path.join(configDir, 'search.json'), 'utf8'));
const output = path.join(dataDir, 'knowledge.json');
const stateOutput = path.join(dataDir, 'crawl-state.json');
const STOPWORDS = new Set('a an and are as at be because been before but by can could did do does for from had has have how i if in into is it its me more most my no not of on or our please should so than that the their them there these they this to was we were what when where which who why will with you your telegram'.split(' '));
const ALLOWED_PROTOCOLS = new Set(crawlerConfig.allowedProtocols);

function normalize(value = '') { return String(value).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim(); }
function cleanText(value = '') { return String(value).replace(/\u00a0/g, ' ').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim(); }
function cleanTitle(value = '') { return cleanText(value).replace(/^Q\s*:\s*/i, '').replace(/\s+[#§]+\s*$/g, '').trim(); }
function safeId(sourceId, title, section, index) { return `${sourceId}-${createHash('sha256').update(`${sourceId}\n${section || ''}\n${title}\n${index}`).digest('hex').slice(0, 20)}`; }
function escapeHtml(value = '') { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;'); }
function safeUrl(value, base) { const raw = String(value ?? '').trim(); if (!raw || /^(?:javascript|data|vbscript):/i.test(raw)) return null; try { const url = new URL(raw, base); return ALLOWED_PROTOCOLS.has(url.protocol) ? url.toString() : null; } catch { return null; } }
function keywordsFor(title, answer, section = '', category = '') {
  return [...new Set(`${normalize(title)} ${normalize(section)} ${normalize(category)} ${normalize(answer).slice(0, 7000)}`.split(' ').filter((x) => (x.length >= 3 || ['api','app','bot','bots','faq','otp','url','2fa','qr','xtr'].includes(x)) && !STOPWORDS.has(x)))].slice(0, 140);
}
function aliasesFor(title, section = '', category = '') {
  const q = cleanTitle(title);
  const haystack = normalize(`${q} ${section}`);
  const aliases = new Set([q]);
  if (/^how\s+/i.test(q)) aliases.add(q.replace(/^how\s+/i, '').replace(/\?$/, ''));
  if (/^what\s+is\s+/i.test(q)) aliases.add(q.replace(/^what\s+is\s+/i, '').replace(/\?$/, ''));
  if (/^what\s+are\s+/i.test(q)) aliases.add(q.replace(/^what\s+are\s+/i, '').replace(/\?$/, ''));
  if (section && normalize(section) !== normalize(q)) aliases.add(section);

  for (const [canonical, variants] of Object.entries(searchConfig.phraseAliases || {})) {
    if (!haystack.includes(normalize(canonical))) continue;
    for (const variant of variants) aliases.add(variant);
  }

  for (const alias of searchConfig.categoryAliases?.[category] || []) aliases.add(alias);
  return [...aliases].map(cleanText).filter(Boolean).slice(0, 20);
}

function serialize(node, $, sourceUrl, pre = false) {
  if (node.type === 'text') return escapeHtml(pre ? node.data : String(node.data).replace(/\s+/g, ' '));
  if (node.type !== 'tag') return '';
  const tag = String(node.name || '').toLowerCase();
  if (['script','style','noscript','template','svg','nav','header','footer','aside'].includes(tag)) return '';
  if (tag === 'br') return '\n';
  if (tag === 'img') { const src = safeUrl(node.attribs?.src, sourceUrl); const alt = cleanText(node.attribs?.alt || 'Image'); return src ? `<a href="${escapeHtml(src)}">🖼️ ${escapeHtml(alt)}</a>` : ''; }
  const inner = $(node).contents().toArray().map((child) => serialize(child, $, sourceUrl, tag === 'pre')).join('');
  if (tag === 'a') { const href = safeUrl(node.attribs?.href, sourceUrl); return href ? `<a href="${escapeHtml(href)}">${inner}</a>` : inner; }
  const inline = new Set(['b','strong','i','em','u','ins','s','strike','del','code','mark','sub','sup','tg-spoiler','tg-reference','tg-emoji','tg-time','tg-math']);
  const block = new Set(['h1','h2','h3','h4','h5','h6','p','pre','ul','ol','li','blockquote','figure','figcaption','table','caption','tr','th','td','details','summary','hr']);
  if (!inline.has(tag) && !block.has(tag)) return inner;
  return tag === 'hr' ? '<hr/>' : `<${tag}>${inner}</${tag}>`;
}
function renderNodes(nodes, $, sourceUrl) { return nodes.map((n) => serialize(n, $, sourceUrl)).join('\n').replace(/\n{3,}/g, '\n\n').trim(); }
function plain(html) { const $ = cheerio.load(`<div>${html}</div>`, { decodeEntities: true }, false); return cleanText($('div').text()); }

function truncateHtml(html, maxChars) {
  if (html.length <= maxChars) return html;
  const $ = cheerio.load(`<div id="__root">${html}</div>`, { decodeEntities: true }, false);
  const root = $('#__root');
  let used = 0;
  const walk = (node) => {
    if (used >= maxChars) { $(node).remove(); return; }
    if (node.type === 'text') {
      const remaining = maxChars - used;
      if (node.data.length > remaining) node.data = node.data.slice(0, Math.max(0, remaining)).trimEnd();
      used += node.data.length;
      return;
    }
    if (node.type !== 'tag') return;
    for (const child of [...node.children || []]) walk(child);
    if (!cleanText($(node).text())) $(node).remove();
  };
  for (const child of [...root[0].children || []]) walk(child);
  return root.html()?.trim() || '';
}

function loadDoc(html) {
  const $ = cheerio.load(html, { decodeEntities: true });
  $('script,style,noscript,template,svg,nav,header,footer,aside,[role="navigation"],[aria-label*="navigation" i],[class*="sidebar" i],[id*="sidebar" i],[class*="breadcrumb" i],[id*="breadcrumb" i]').remove();
  const candidates = ['main','article','#dev_page_content','#dev_page_content_wrap','.dev_page_content_wrap','.dev_page_content','body'];
  let root = $('body'); let best = 0;
  for (const selector of candidates) $(selector).each((_, el) => { const count = $(el).find('h1,h2,h3,h4,h5,h6').length; if (count > best) { root = $(el); best = count; } });
  return { $, root };
}
function contentNodes(root) {
  const nodes = root.find('h1,h2,h3,h4,h5,h6,p,ul,ol,pre,blockquote,figure,table,details,hr').toArray();
  const selected = new Set(nodes);
  return nodes.filter((node) => { let p = node.parent; while (p) { if (selected.has(p)) return false; p = p.parent; } return true; });
}

function makeItem(source, heading, answerHtml, section, index) {
  const safeHtml = truncateHtml(answerHtml, crawlerConfig.maxAnswerChars);
  const answer = plain(safeHtml);
  if (answer.length < 20) return null;
  const title = heading.text;
  return { id: safeId(source.id, title, section, index), type: source.kind, category: source.category, title, question: title, section, aliases: aliasesFor(title, section, source.category), keywords: keywordsFor(title, answer, section, source.category), answer, answer_html: safeHtml, source: { id: source.id, title: source.title, url: source.url }, metadata: { official: true, audience: source.audience, priority: source.priority } };
}

function extractFaq(nodes, $, source, questionMode = 'q') {
  const headings = [];
  nodes.forEach((n, index) => {
    if (!/^h[1-6]$/i.test(n.name)) return;
    const raw = cleanText($(n).text());
    const isQuestion = questionMode === 'q' ? /^Q\s*:/i.test(raw) : /\?$/.test(raw) || /^(how|what|why|where|when|who|which|can|could|should|is|are|do|does|did|will|may|i\s+can't|i\s+cannot)\b/i.test(raw);
    headings.push({ index, level: Number(n.name.slice(1)), raw, text: cleanTitle(raw), isQuestion });
  });
  const questions = headings.filter((heading) => heading.isQuestion);
  const items = [];
  for (let h = 0; h < questions.length; h += 1) {
    const heading = questions[h];
    let end = nodes.length;
    for (const next of headings) if (next.index > heading.index && next.level <= heading.level) { end = next.index; break; }
    const answerHtml = renderNodes(nodes.slice(heading.index + 1, end), $, source.url);
    let section = null;
    const position = headings.indexOf(heading);
    for (let j = position - 1; j >= 0; j -= 1) if (headings[j].level < heading.level && !headings[j].isQuestion) { section = headings[j].text; break; }
    const item = makeItem(source, heading, answerHtml, section, h);
    if (item) items.push(item);
  }
  return items;
}

function extractSections(nodes, $, source) {
  const headings = [];
  nodes.forEach((n, index) => { if (/^h[1-6]$/i.test(n.name)) { const text = cleanTitle($(n).text()); if (text) headings.push({ index, level: Number(n.name.slice(1)), text }); } });
  const items = [];
  for (let h = 0; h < headings.length; h += 1) {
    const heading = headings[h];
    if (heading.level < 2) continue;
    let end = nodes.length;
    for (let j = h + 1; j < headings.length; j += 1) if (headings[j].level <= heading.level) { end = headings[j].index; break; }
    const answerHtml = renderNodes(nodes.slice(heading.index + 1, end), $, source.url);
    let section = null;
    for (let j = h - 1; j >= 0; j -= 1) if (headings[j].level < heading.level) { section = headings[j].text; break; }
    const item = makeItem(source, heading, answerHtml, section, h);
    if (item) items.push(item);
  }
  return items;
}

function extract(html, source) {
  const { $, root } = loadDoc(html);
  const nodes = contentNodes(root);
  if (source.extractor === 'faq-q') return extractFaq(nodes, $, source, 'q');
  if (source.extractor === 'faq-heading') return extractFaq(nodes, $, source, 'heading');
  return extractSections(nodes, $, source);
}

async function fetchSource(source) {
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), crawlerConfig.requestTimeoutMs);
  try {
    const res = await fetch(source.url, { headers: { 'user-agent': crawlerConfig.userAgent, accept: 'text/html,application/xhtml+xml' }, signal: controller.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const length = Number(res.headers.get('content-length') || 0);
    if (length && length > crawlerConfig.maxSourceBytes) throw new Error(`source exceeds ${crawlerConfig.maxSourceBytes} bytes`);
    const html = await res.text();
    if (Buffer.byteLength(html, 'utf8') > crawlerConfig.maxSourceBytes) throw new Error(`source exceeds ${crawlerConfig.maxSourceBytes} bytes`);
    return html;
  } finally { clearTimeout(timer); }
}

function categoryForAnnouncement(title = '') {
  const value = normalize(title);
  const rules = [
    ['GIFTS', /gift|collectible/],
    ['STORIES', /stor(y|ies)|live stor/],
    ['STARS', /star|payment|paid/],
    ['PREMIUM', /premium/],
    ['GROUPS', /group|community|communities|admin|moderation/],
    ['CHANNELS', /channel|subscriber|post/],
    ['CALLS', /call|voice chat|video chat/],
    ['PRIVACY', /privacy|security|secret chat|encryption/],
    ['MEDIA', /photo|video|file|gif|media|camera/],
    ['SEARCH', /search|discover/],
    ['BUSINESS', /business|away message|quick reply/],
    ['ACCOUNT', /login|account|phone number|passkey/]
  ];
  return rules.find(([, pattern]) => pattern.test(value))?.[0] ?? 'NEWS';
}

async function discoverUserAnnouncements() {
  const listing = sourcesConfig.sources.find((source) => source.id === 'telegram-blog' && source.enabled);
  if (!listing) return [];
  process.stdout.write('Discovering official Telegram user-feature announcements... ');
  const html = await fetchSource(listing);
  const $ = cheerio.load(html);
  const candidates = new Map();
  $('main a[href], article a[href], a[href]').each((_, element) => {
    const anchor = $(element);
    const raw = anchor.attr('href');
    if (!raw) return;
    let url;
    try { url = new URL(raw, listing.url); } catch { return; }
    if (!['telegram.org', 'www.telegram.org'].includes(url.hostname)) return;
    if (!/^\\/blog\\/[a-z0-9][a-z0-9-]*\\/?$/i.test(url.pathname)) return;
    const slug = url.pathname.split('/').filter(Boolean).at(-1);
    if (!slug || ['blog'].includes(slug)) return;
    const title = cleanTitle(anchor.text()) || slug.replace(/-/g, ' ');
    if (title.length < 8 || /bot api|api changelog|mtproto|developer documentation|api updates/i.test(title)) return;
    const canonical = `https://telegram.org/blog/${slug}`;
    if (!candidates.has(canonical)) candidates.set(canonical, { id: `telegram-blog-${slug}`, title, url: canonical, kind: 'guide', extractor: 'sections', audience: 'user', category: categoryForAnnouncement(title), priority: 76, enabled: true, index: true, discovered: true });
  });
  const known = new Set(sourcesConfig.sources.map((source) => source.url.replace(/\\/$/, '')));
  const discovered = [...candidates.values()].filter((source) => !known.has(source.url.replace(/\\/$/, ''))).slice(0, 16);
  console.log(`${discovered.length} new candidate announcements`);
  return discovered;
}

const staticIndexedSources = sourcesConfig.sources.filter((s) => s.enabled && s.index && s.audience === 'user');
const discoveredSources = await discoverUserAnnouncements().catch((error) => { console.warn('Announcement discovery unavailable; continuing with curated sources:', error.message); return []; });
const indexedSources = [...staticIndexedSources, ...discoveredSources];
const previous = JSON.parse(await fs.readFile(output, 'utf8').catch(() => '{"schemaVersion":2,"sources":[],"items":[]}'));
const previousCounts = new Map((previous.sources || []).map((s) => [s.id, previous.items?.filter((i) => i.source?.id === s.id).length || 0]));
const allItems = []; const sourceMeta = []; const state = { schemaVersion: 1, generatedAt: null, status: 'running', sources: {}, discovery: { candidates: discoveredSources.length, indexed: 0 } };
for (const source of indexedSources) {
  process.stdout.write(`Crawling ${source.id}... `);
  let html;
  try { html = await fetchSource(source); } catch (error) { if (source.discovered) { console.warn(`Skipping discovered announcement ${source.id}: fetch failed: ${error.message}`); continue; } throw new Error(`Fetch failed for ${source.id}: ${error.message}`); }
  const items = extract(html, source); const oldCount = previousCounts.get(source.id) || 0;
  if (items.length < crawlerConfig.minItemsPerSource) { if (source.discovered) { console.warn(`Skipping discovered announcement ${source.id}: extractor produced no usable sections`); continue; } throw new Error(`Safety stop: ${source.id} produced ${items.length} entries`); }
  if (!source.discovered && oldCount >= 5 && items.length < Math.floor(oldCount * (1 - crawlerConfig.maxDropRatio))) throw new Error(`Safety stop: ${source.id} dropped from ${oldCount} to ${items.length} entries`);
  allItems.push(...items);
  sourceMeta.push({ id: source.id, title: source.title, url: source.url, kind: source.kind, audience: source.audience, category: source.category, priority: source.priority });
  if (source.discovered) state.discovery.indexed += 1;
  state.sources[source.id] = { items: items.length, hash: createHash('sha256').update(html).digest('hex') };
  console.log(`${items.length} entries`);
}
if (!allItems.length) throw new Error('Safety stop: generated knowledge is empty');
allItems.sort((a, b) => a.id.localeCompare(b.id));
sourceMeta.sort((a, b) => a.id.localeCompare(b.id));
const generatedAt = new Date().toISOString();
const dataset = { schemaVersion: 3, generatedAt, generator: 'scripts/crawl/index.mjs', sources: sourceMeta, items: allItems };
state.generatedAt = generatedAt; state.status = 'success'; state.totalItems = allItems.length; state.totalSources = sourceMeta.length;
await fs.mkdir(dataDir, { recursive: true });
await fs.writeFile(output, `${JSON.stringify(dataset, null, 2)}\n`);
await fs.writeFile(stateOutput, `${JSON.stringify(state, null, 2)}\n`);
console.log(`Knowledge generated: ${allItems.length} entries across ${sourceMeta.length} sources.`);
