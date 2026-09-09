import fs from 'node:fs/promises';
import path from 'node:path';

const file = path.join(process.cwd(), 'data', 'knowledge.json');
const data = JSON.parse(await fs.readFile(file, 'utf8'));

if (data.schemaVersion !== 1) throw new Error('Unsupported knowledge schemaVersion');
if (!Array.isArray(data.sources) || data.sources.length < 1) throw new Error('No knowledge sources configured');
if (!Array.isArray(data.items) || data.items.length < 1) throw new Error('Knowledge dataset is empty');

const sourceIds = new Set(data.sources.map((source) => source.id));
const ids = new Set();
const questions = new Set();

for (const item of data.items) {
  if (!item.id || ids.has(item.id)) throw new Error(`Duplicate/missing item id: ${item.id ?? '(missing)'}`);
  if (!item.title || !item.answer) throw new Error(`Incomplete item: ${item.id}`);
  if (!item.source?.id || !sourceIds.has(item.source.id)) throw new Error(`Invalid source for ${item.id}`);
  if (!item.source.url?.startsWith('https://')) throw new Error(`Invalid source URL for ${item.id}`);
  if (item.answer.length < 20) throw new Error(`Answer too short for ${item.id}`);

  ids.add(item.id);
  const normalized = item.title.toLowerCase().replace(/\s+/g, ' ').trim();
  if (questions.has(normalized)) throw new Error(`Duplicate title/question: ${item.title}`);
  questions.add(normalized);
}

for (const source of data.sources) {
  const count = data.items.filter((item) => item.source.id === source.id).length;
  if (count === 0) throw new Error(`Source has no indexed entries: ${source.id}`);
}

console.log(`Knowledge validation passed: ${data.items.length} entries across ${data.sources.length} sources.`);
for (const source of data.sources) {
  const count = data.items.filter((item) => item.source.id === source.id).length;
  console.log(`  ${source.id}: ${count}`);
}
