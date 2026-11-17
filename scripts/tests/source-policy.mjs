import fs from 'node:fs';
import path from 'node:path';

const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'config', 'sources.json'), 'utf8'));
const indexed = config.sources.filter((source) => source.enabled && source.index);
const discovery = config.sources.find((source) => source.id === 'telegram-blog');

if (!discovery || discovery.index !== false || !discovery.enabled) {
  throw new Error('Telegram Blog must remain enabled as discovery-only, not directly indexed.');
}
for (const source of indexed) {
  if (source.audience !== 'user') throw new Error(`Non-user source is enabled for FAQ indexing: ${source.id}`);
  if (!/^https:\/\/(?:www\.)?telegram\.org\//i.test(source.url)) throw new Error(`Non-official source URL: ${source.id}`);
}
const forbidden = config.sources.filter((source) => /bot api|mtproto|tdlib|developer/i.test(`${source.id} ${source.title} ${source.url}`) && source.enabled && source.index);
if (forbidden.length) throw new Error(`Developer documentation entered user FAQ indexing: ${forbidden.map((source) => source.id).join(', ')}`);

console.log(`Source policy passed: ${indexed.length} user-facing sources indexed; developer documentation excluded.`);
