import fs from 'node:fs';
import path from 'node:path';

const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config', 'sources.json'), 'utf8'));
const indexed = config.sources.filter((source) => source.enabled && source.index);
const discovery = config.sources.find((source) => source.id === 'telegram-blog');
const requiredUserTerms = [
  'telegram-tos', 'telegram-tos-stars', 'telegram-tos-business', 'telegram-tos-bots',
  'telegram-tos-mini-apps', 'telegram-tos-content-creators', 'telegram-tos-content-licensing', 'telegram-tos-eu-dsa'
];

if (!discovery || discovery.index !== false || !discovery.enabled) {
  throw new Error('Telegram Blog must remain enabled as discovery-only, not directly indexed.');
}
for (const id of requiredUserTerms) {
  const source = indexed.find((entry) => entry.id === id);
  if (!source) throw new Error(`Required official user terms source is missing or not indexed: ${id}`);
  if (source.kind !== 'terms') throw new Error(`Terms source has incorrect kind: ${id}`);
}
for (const source of indexed) {
  if (source.audience !== 'user') throw new Error(`Non-user source is enabled for FAQ indexing: ${source.id}`);
  if (!/^https:\/\/(?:www\.)?telegram\.org\//i.test(source.url)) throw new Error(`Non-official source URL: ${source.id}`);
}
const forbidden = config.sources.filter((source) => /bot api|mtproto|tdlib|developer/i.test(`${source.id} ${source.title} ${source.url}`) && source.enabled && source.index);
if (forbidden.length) throw new Error(`Developer documentation entered user FAQ indexing: ${forbidden.map((source) => source.id).join(', ')}`);

console.log(`Source policy passed: ${indexed.length} user-facing sources indexed; all eight official user-terms sources present; developer documentation excluded.`);
