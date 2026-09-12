import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const file = path.join(root, 'data', 'knowledge.json');
const config = JSON.parse(await fs.readFile(path.join(root, 'config', 'sources.json'), 'utf8'));
const data = JSON.parse(await fs.readFile(file, 'utf8'));

if (![2,3].includes(data.schemaVersion)) throw new Error(`Unsupported knowledge schemaVersion: ${data.schemaVersion}`);
if (!Array.isArray(data.sources) || data.sources.length < 1) throw new Error('No knowledge sources configured');
if (!Array.isArray(data.items) || data.items.length < 1) throw new Error('Knowledge dataset is empty');

const sourceIds = new Set(data.sources.map((source) => source.id));
const configured = new Set(config.sources.filter((source) => source.enabled && source.index).map((source) => source.id));
const ids = new Set();
const questions = new Set();
const allowedTags = new Set(['a','b','strong','i','em','u','ins','s','strike','del','code','mark','sub','sup','tg-spoiler','tg-reference','tg-emoji','tg-time','tg-math','h1','h2','h3','h4','h5','h6','p','pre','footer','hr','ul','ol','li','blockquote','aside','figure','figcaption','cite','table','caption','tr','th','td','details','summary','input']);

for (const id of configured) if (!sourceIds.has(id)) throw new Error(`Configured source missing from dataset: ${id}`);
for (const item of data.items) {
  if (!item.id || ids.has(item.id)) throw new Error(`Duplicate/missing item id: ${item.id ?? '(missing)'}`);
  if (!item.title || !item.question || !item.answer || !item.answer_html) throw new Error(`Incomplete item: ${item.id}`);
  if (!item.source?.id || !sourceIds.has(item.source.id)) throw new Error(`Invalid source for ${item.id}`);
  if (!item.source.url?.startsWith('https://')) throw new Error(`Invalid source URL for ${item.id}`);
  if (item.answer.length < 20 || item.answer_html.length < 20) throw new Error(`Answer too short for ${item.id}`);
  if (data.schemaVersion >= 3 && !item.category) throw new Error(`Missing category for ${item.id}`);
  const tags = [...item.answer_html.matchAll(/<\\/?([A-Za-z0-9:-]+)/g)].map((match) => match[1].toLowerCase());
  for (const tag of tags) if (!allowedTags.has(tag)) throw new Error(`Unsupported Rich HTML tag <${tag}> in ${item.id}`);
  ids.add(item.id);
  const normalized = `${item.source.id}::${item.title.toLowerCase().replace(/\\s+/g,' ').trim()}`;
  if (questions.has(normalized)) throw new Error(`Duplicate title/question in source: ${item.title}`);
  questions.add(normalized);
}
for (const source of data.sources) {
  const count = data.items.filter((item) => item.source.id === source.id).length;
  if (count === 0) throw new Error(`Source has no indexed entries: ${source.id}`);
}
console.log(`Knowledge validation passed: ${data.items.length} entries across ${data.sources.length} sources.`);
