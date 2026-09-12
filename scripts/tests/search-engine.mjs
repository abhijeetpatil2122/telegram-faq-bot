import fs from 'node:fs';
import path from 'node:path';
import { searchKnowledge } from '../search-engine.mjs';

const root = path.resolve(process.cwd());
const knowledge = JSON.parse(fs.readFileSync(path.join(root, 'data', 'knowledge.json'), 'utf8'));

const cases = [
  ['I forgot my phone number privacy settings', ['telegram-privacy', 'telegram-faq']],
  ['how do I enable 2fa', ['telegram-faq', 'telegram-faq-premium']],
  ['how to create a bot token', ['bots', 'bot-features']],
  ['how does webhook work', ['bots', 'bot-features']],
  ['what are Telegram Stars', ['telegram-stars']],
  ['how do collectible gifts work', ['telegram-gifts', 'telegram-gift-marketplace']],
  ['how do stories work in channels', ['telegram-stories', 'telegram-live-stories']],
  ['how do I search public posts', ['telegram-search']],
  ['what is Telegram Business', ['telegram-business']]
];

let failures = 0;
for (const [query, expectedSources] of cases) {
  const results = searchKnowledge(knowledge.items, query).slice(0, 5);
  const sourceIds = results.map((item) => item.source?.id).filter(Boolean);
  const matched = expectedSources.some((sourceId) => sourceIds.includes(sourceId));
  if (!matched) {
    failures += 1;
    console.error(`FAIL: ${query}`);
    console.error(`  expected one of: ${expectedSources.join(', ')}`);
    console.error(`  got: ${sourceIds.join(', ') || '(none)'}`);
  } else {
    console.log(`PASS: ${query} -> ${sourceIds[0]}`);
  }
}

if (failures) process.exit(1);
console.log(`Search engine regression tests passed: ${cases.length}/${cases.length}`);
