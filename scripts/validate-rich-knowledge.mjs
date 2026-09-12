import fs from 'node:fs/promises';
import path from 'node:path';
import * as cheerio from 'cheerio';

const root = process.cwd();
const data = JSON.parse(await fs.readFile(path.join(root, 'data', 'knowledge.json'), 'utf8'));
const config = JSON.parse(await fs.readFile(path.join(root, 'config', 'sources.json'), 'utf8'));
const categories = JSON.parse(await fs.readFile(path.join(root, 'config', 'categories.json'), 'utf8'));
const configured = new Map(config.sources.filter((s) => s.enabled).map((s) => [s.id, s]));
const allowedKinds = new Set(['faq', 'guide', 'terms', 'discovery', 'developer-reference']);
const allowedAudiences = new Set(['user', 'developer']);
const allowedTags = new Set(['a','b','strong','i','em','u','ins','s','strike','del','code','mark','sub','sup','tg-spoiler','tg-reference','tg-emoji','tg-time','tg-math','h1','h2','h3','h4','h5','h6','p','pre','footer','hr','ul','ol','li','blockquote','aside','figure','figcaption','cite','table','caption','tr','th','td','details','summary']);
const voidTags = new Set(['hr']);
const ids = new Set();
const questions = new Set();
const answers = new Map();

function normalize(value = '') { return String(value).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim(); }
function validateHtml(html, id) {
  const stack = [];
  for (const match of String(html).matchAll(/<\/?([A-Za-z0-9:-]+)(?:\s[^>]*)?>/g)) {
    const full = match[0]; const tag = match[1].toLowerCase(); const closing = /^<\//.test(full);
    if (!allowedTags.has(tag)) throw new Error(`Unsupported tag <${tag}> in ${id}`);
    if (voidTags.has(tag)) { if (closing) throw new Error(`Invalid closing tag </${tag}> in ${id}`); continue; }
    if (closing) { if (stack.pop() !== tag) throw new Error(`Unbalanced tag </${tag}> in ${id}`); }
    else if (!/\/\s*>$/.test(full)) stack.push(tag);
  }
  if (stack.length) throw new Error(`Unclosed tag <${stack.at(-1)}> in ${id}`);
  const $ = cheerio.load(`<div>${html}</div>`, { decodeEntities: true }, false);
  if ($('script,style,iframe,object,embed,form,input,button').length) throw new Error(`Unsafe HTML element in ${id}`);
  for (const link of $('a').toArray()) {
    const href = String($(link).attr('href') || '');
    if (!/^(?:https|tg|mailto|tel):/i.test(href)) throw new Error(`Unsafe link in ${id}: ${href}`);
  }
  return normalize($('div').text());
}

if (![2, 3].includes(data.schemaVersion)) throw new Error(`Unsupported schemaVersion: ${data.schemaVersion}`);
if (!Array.isArray(data.sources) || !Array.isArray(data.items) || !data.items.length) throw new Error('Invalid or empty knowledge dataset');
for (const source of data.sources) {
  const cfg = configured.get(source.id);
  if (!cfg) throw new Error(`Unknown dataset source: ${source.id}`);
  if (!/^https:\/\//i.test(source.url)) throw new Error(`Invalid source URL: ${source.id}`);
  if (source.kind !== cfg.kind || source.category !== cfg.category) throw new Error(`Source metadata mismatch: ${source.id}`);
}

for (const item of data.items) {
  if (!item.id || ids.has(item.id)) throw new Error(`Duplicate/missing item id: ${item.id || '(missing)'}`);
  if (!item.title || !item.question || !item.answer || !item.answer_html) throw new Error(`Incomplete item: ${item.id}`);
  if (!configured.has(item.source?.id)) throw new Error(`Unknown item source: ${item.id}`);
  if (item.answer.length < 20 || item.answer.length > 28000) throw new Error(`Invalid answer length: ${item.id}`);
  if (!allowedKinds.has(item.type)) throw new Error(`Invalid type: ${item.id}`);
  if (!allowedAudiences.has(item.metadata?.audience)) throw new Error(`Invalid audience: ${item.id}`);
  if (item.metadata?.official !== true) throw new Error(`Item is not marked official: ${item.id}`);
  if (!categories[item.category]) throw new Error(`Invalid category: ${item.id}`);
  if (!Array.isArray(item.aliases) || !Array.isArray(item.keywords)) throw new Error(`Invalid aliases/keywords: ${item.id}`);
  const rendered = validateHtml(item.answer_html, item.id);
  const stored = normalize(item.answer);
  if (!rendered || !stored || !rendered.startsWith(stored.slice(0, Math.min(80, stored.length)))) throw new Error(`Answer/html mismatch: ${item.id}`);
  const questionKey = `${item.source.id}::${normalize(item.section || '')}::${normalize(item.question)}`;
  if (questions.has(questionKey)) throw new Error(`Duplicate question: ${item.id}`);
  questions.add(questionKey);
  const answerKey = `${item.source.id}::${stored}`;
  if (answers.has(answerKey) && normalize(answers.get(answerKey)) !== normalize(item.question)) throw new Error(`Duplicate answer for different questions: ${item.id}`);
  answers.set(answerKey, item.question);
  ids.add(item.id);
}

for (const source of config.sources.filter((s) => s.enabled && s.index)) {
  const count = data.items.filter((item) => item.source.id === source.id).length;
  if (!count) throw new Error(`Indexed source has no entries: ${source.id}`);
}
console.log(`Rich knowledge validation passed: ${data.items.length} entries.`);
