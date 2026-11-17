import fs from 'node:fs';
import path from 'node:path';
import { searchKnowledge } from '../search-engine.mjs';

const root = process.cwd();
const dataset = JSON.parse(fs.readFileSync(path.join(root, 'data', 'knowledge.json'), 'utf8'));
const searchConfig = JSON.parse(fs.readFileSync(path.join(root, 'config', 'search.json'), 'utf8'));
const items = dataset.items || [];

if (!items.length) throw new Error('Search regression: generated knowledge dataset is empty');

const cases = [
  { query: 'how can I hide my phone number', category: 'PRIVACY' },
  { query: 'telegram premium subscription', category: 'PREMIUM' },
  { query: 'how do I create a group', category: 'GROUPS' },
  { query: 'how do I start a voice chat', category: 'CALLS' },
  { query: 'how do telegram stars work', category: 'STARS' },
  { query: 'how do I send a gift', category: 'GIFTS' },
  { query: 'how do stories work', category: 'STORIES' },
  { query: 'how do I search public posts', category: 'SEARCH' },
  { query: 'how do I report spam', category: 'SECURITY' },
  { query: 'what are the Telegram terms of service', category: 'LEGAL', source: 'telegram-tos' },
  { query: 'what terms apply when I use a Telegram bot', category: 'BOTS', source: 'telegram-tos-bots' },
  { query: 'what are the terms for Telegram Mini Apps', category: 'BOTS', source: 'telegram-tos-mini-apps' },
  { query: 'can I scrape Telegram public content to train an AI model', category: 'LEGAL', source: 'telegram-tos-content-licensing' },
  { query: 'what are the rules for buying and spending Stars', category: 'STARS', source: 'telegram-tos-stars' },
  { query: 'what terms apply to Telegram Business subscriptions', category: 'BUSINESS', source: 'telegram-tos-business' },
  { query: 'what are the Telegram content creator terms', category: 'LEGAL', source: 'telegram-tos-content-creators' },
  { query: 'what are my rights under the EU Digital Services Act on Telegram', category: 'LEGAL', source: 'telegram-tos-eu-dsa' }
];

for (const test of cases) {
  // Exercise the exact production search implementation and its category/phrase aliases.
  const results = searchKnowledge(items, test.query, { minScore: 24, diversify: true }).slice(0, 10);
  if (!results.length) throw new Error(`Search regression: no result for ${test.query}`);
  if (test.source && !results.some((item) => item.source?.id === test.source)) {
    throw new Error(`Inline-query search regression: ${test.query} did not surface ${test.source}; top sources=${results.map((item) => item.source?.id).join(',')}`);
  }
  if (!results.some((item) => String(item.category).toUpperCase() === test.category)) {
    throw new Error(`Search regression: ${test.query} did not surface ${test.category}; top categories=${results.map((item) => item.category).join(',')}`);
  }
}

for (const [canonical, variants] of Object.entries(searchConfig.phraseAliases || {})) {
  if (!canonical || !Array.isArray(variants) || variants.length === 0) throw new Error(`Invalid phrase alias configuration for ${canonical}`);
}
for (const [category, aliases] of Object.entries(searchConfig.categoryAliases || {})) {
  if (!category || !Array.isArray(aliases) || aliases.some((alias) => typeof alias !== 'string' || !alias.trim())) {
    throw new Error(`Invalid category alias configuration for ${category}`);
  }
}

console.log(`Inline-query search regression passed using the production retrieval engine: ${cases.length} representative queries across ${items.length} knowledge entries.`);
