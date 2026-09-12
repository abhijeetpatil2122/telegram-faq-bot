import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import * as cheerio from 'cheerio';

const root = path.resolve(process.cwd());
const configDir = path.join(root, 'config');
const dataDir = path.join(root, 'data');
const sourcesConfig = JSON.parse(await fs.readFile(path.join(configDir, 'sources.json'), 'utf8'));
const crawlerConfig = JSON.parse(await fs.readFile(path.join(configDir, 'crawler.json'), 'utf8'));
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
function keywordsFor(title, answer, section = '') { return [...new Set(`${normalize(title)} ${normalize(section)} ${normalize(answer).slice(0, 7000)}`.split(' ').filter((x) => (x.length >= 3 || ['api','app','bot','bots','faq','otp','url','2fa','qr'].includes(x)) && !STOPWORDS.has(x)))].slice(0, 120); }
function aliasesFor(title, section = '') {
  const q = cleanTitle(title);
  const aliases = new Set([q]);
  if (/^how\s+/i.test(q)) aliases.add(q.replace(/^how\s+/i, '').replace(/\?$/, ''));
  if (/^what\s+is\s+/i.test(q)) aliases.add(q.replace(/^what\s+is\s+/i, '').replace(/\?$/, ''));
  if (/^what\s+are\s+/i.test(q)) aliases.add(q.replace(/^what\s+are\s+/i, '').replace(/\?$/, ''));
  if (section && normalize(section) !== normalize(q)) aliases.add(section);
  return [...aliases].filter(Boolean).slice(0, 6);
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
  return {
    id: safeId(source.id, title, section, index),
    type: source.kind,
    category: source.category,
    title,
    question: title,
    section,
    aliases: aliasesFor(title, section),
    keywords: keywordsFor(title, answer, section),
    answer,
    answer_html: safeHtml,
    source: { id: source.id, title: source.title, url: source.url },
    metadata: { official: true, audience: source.audience, priority: source.priority }
  };
}

function extractFaq(nodes, $, source) {
  const headings = [];
  nodes.forEach((n, index) => {
    if (/^h[1-6]$/i.test(n.name)) {
      const raw = cleanText($(n).text());
      headings.push({ index, level: Number(n.name.slice(1)), raw, text: cleanTitle(raw), isQuestion: /^Q\s*:/i.test(raw) });
    }
  });
  const questions = headings.filter((heading) => heading.isQuestion);
  const items = [];
  for (let h = 0; h < questions.length; h += 1) {
    const heading = questions[h];
    let end = nodes.length;
    for (const next of headings) if (next.index > heading.index && next.level <= heading.level) { end = next.index; break; }
    const answerHtml = renderNodes(nodes.slice(heading.index + 1, end), $, source.url);
    let section = null;
    for (let j = headings.indexOf(heading) - 1; j >= 0; j -= 1) if (headings[j].level < heading.level && !headings[j].isQuestion) { section = headings[j].text; break; }
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
  if (source.kind === 'faq') return extractFaq(nodes, $, source);
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

const indexedSources = sourcesConfig.sources.filter((s) => s.enabled && s.index);
const previous = JSON.parse(await fs.readFile(output, 'utf8').catch(() => '{"schemaVersion":2,"sources":[],"items":[]}'));
const previousCounts = new Map((previous.sources || []).map((s) => [s.id, previous.items?.filter((i) => i.source?.id === s.id).length || 0]));
const allItems = []; const sourceMeta = []; const state = { schemaVersion: 1, generatedAt: null, status: 'running', sources: {} };
for (const source of indexedSources) {
  process.stdout.write(`Crawling ${source.id}... `);
  let html;
  try { html = await fetchSource(source); } catch (error) { throw new Error(`Fetch failed for ${source.id}: ${error.message}`); }
  const items = extract(html, source); const oldCount = previousCounts.get(source.id) || 0;
  if (items.length < crawlerConfig.minItemsPerSource) throw new Error(`Safety stop: ${source.id} produced ${items.length} entries`);
  if (oldCount >= 5 && items.length < Math.floor(oldCount * (1 - crawlerConfig.maxDropRatio))) throw new Error(`Safety stop: ${source.id} dropped from ${oldCount} to ${items.length} entries`);
  allItems.push(...items);
  sourceMeta.push({ id: source.id, title: source.title, url: source.url, kind: source.kind, audience: source.audience, category: source.category, priority: source.priority });
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
