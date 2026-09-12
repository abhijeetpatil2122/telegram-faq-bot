import fs from 'node:fs';
import path from 'node:path';
import { detectIntents, fuzzySimilarity, searchKnowledge } from '../search-engine.mjs';

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
  ['what is Telegram Business', ['telegram-business']],
  ['premum subscription', ['telegram-faq-premium']],
  ['tg bot token', ['bots', 'bot-features']],
  ['why is my webhok not workng', ['bots', 'bot-features']]
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

const howToIntents = detectIntents('how do I configure a webhook');
const troubleshootingIntents = detectIntents('why is my webhook not working');
const developerIntents = detectIntents('Telegram bot API token');

if (!howToIntents.has('how_to')) {
  failures += 1;
  console.error('FAIL: how_to intent detection');
}
if (!troubleshootingIntents.has('troubleshooting')) {
  failures += 1;
  console.error('FAIL: troubleshooting intent detection');
}
if (!developerIntents.has('developer')) {
  failures += 1;
  console.error('FAIL: developer intent detection');
}
if (fuzzySimilarity('premum', 'premium') < 0.8) {
  failures += 1;
  console.error('FAIL: fuzzy similarity for premium typo');
}
if (fuzzySimilarity('webhok', 'webhook') < 0.8) {
  failures += 1;
  console.error('FAIL: fuzzy similarity for webhook typo');
}

const synthetic = [
  {
    id: 'a',
    title: 'How do I change my username?',
    question: 'How do I change my username?',
    section: 'Username',
    aliases: [],
    keywords: ['username', 'handle'],
    category: 'ACCOUNT',
    metadata: { audience: 'user', priority: 50 },
    source: { id: 'account-source', title: 'Account FAQ', url: 'https://example.com/account' }
  },
  {
    id: 'b',
    title: 'How do I use usernames in bots?',
    question: 'How do I use usernames in bots?',
    section: 'Bots',
    aliases: [],
    keywords: ['username', 'bot'],
    category: 'BOTS',
    metadata: { audience: 'developer', priority: 50 },
    source: { id: 'bot-source', title: 'Bot Docs', url: 'https://example.com/bots' }
  },
  {
    id: 'c',
    title: 'What is a Telegram username?',
    question: 'What is a Telegram username?',
    section: 'Username',
    aliases: [],
    keywords: ['username', 'handle'],
    category: 'ACCOUNT',
    metadata: { audience: 'user', priority: 50 },
    source: { id: 'account-source', title: 'Account FAQ', url: 'https://example.com/account' }
  }
];

const diversified = searchKnowledge(synthetic, 'username', { minScore: 0, diversify: true });
const distinctSources = new Set(diversified.slice(0, 2).map((item) => item.source?.id));
if (distinctSources.size < 2) {
  failures += 1;
  console.error('FAIL: result diversification did not surface a second source');
}

if (failures) process.exit(1);
console.log(`Search engine regression tests passed: ${cases.length}/${cases.length} + intent/fuzzy/diversity checks`);
