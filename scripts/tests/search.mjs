import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const knowledge = JSON.parse(fs.readFileSync(path.join(root, 'data', 'knowledge.json'), 'utf8'));
const searchConfig = JSON.parse(fs.readFileSync(path.join(root, 'config', 'search.json'), 'utf8'));
const items = knowledge.items || [];

const STOPWORDS = new Set([
  'a','an','and','are','as','at','be','can','could','do','does','for','from','how','i','in','is','it','me','of','on','or','please','tell','that','the','this','to','what','when','where','which','who','why','with','you','your'
]);

function normalize(value = '') {
  return String(value).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}
function tokens(value) {
  return [...new Set(normalize(value).split(' ').filter((x) => x.length >= 2 && !STOPWORDS.has(x)))];
}
function tokenSet(value) { return new Set(normalize(value).split(' ').filter(Boolean)); }
function coverage(queryTokens, value) {
  const set = tokenSet(value);
  return queryTokens.filter((token) => set.has(token)).length;
}
function score(item, query) {
  const q = normalize(query);
  const qt = tokens(query);
  if (!q || !qt.length) return 0;
  const fields = {
    question: normalize(item.question),
    title: normalize(item.title),
    section: normalize(item.section),
    aliases: (item.aliases || []).map(normalize),
    keywords: (item.keywords || []).map(normalize)
  };
  const primary = fields.question || fields.title;
  const all = [fields.question, fields.title, fields.section, ...fields.aliases, ...fields.keywords];
  let points = 0;
  if (fields.question === q) points += 1000;
  if (fields.title === q) points += 900;
  if ((` ${fields.question} `).includes(` ${q} `)) points += 420;
  if ((` ${fields.title} `).includes(` ${q} `)) points += 360;
  if (fields.aliases.some((x) => (` ${x} `).includes(` ${q} `))) points += 300;
  if (fields.question.includes(q)) points += 140;
  if (fields.title.includes(q)) points += 120;
  const primaryHits = coverage(qt, primary);
  points += primaryHits * 90;
  points += coverage(qt, fields.title) * 65;
  points += coverage(qt, fields.section) * 35;
  points += coverage(qt, fields.aliases.join(' ')) * 45;
  points += coverage(qt, fields.keywords.join(' ')) * 20;
  const anyHits = qt.filter((t) => all.some((field) => tokenSet(field).has(t))).length;
  if (primaryHits === qt.length) points += 260;
  else if (primaryHits >= Math.max(1, qt.length - 1)) points += 100;
  if (anyHits === qt.length) points += 120;
  return points;
}

const cases = [
  { query: 'how can I hide my phone number', category: 'PRIVACY' },
  { query: 'telegram premium subscription', category: 'PREMIUM' },
  { query: 'how do I make a bot', category: 'BOTS' },
  { query: 'what is inline mode', category: 'BOTS' },
  { query: 'how do telegram stars work', category: 'STARS' },
  { query: 'how do I send a gift', category: 'GIFTS' },
  { query: 'how do stories work', category: 'STORIES' },
  { query: 'how do I search public posts', category: 'SEARCH' },
  { query: 'how do I report spam', category: 'SECURITY' }
];

for (const test of cases) {
  const ranked = items.map((item) => ({ item, score: score(item, test.query) })).filter((x) => x.score >= 24).sort((a, b) => b.score - a.score);
  const top = ranked.slice(0, 10);
  if (!top.length) throw new Error(`Search regression: no result for ${test.query}`);
  if (!top.some(({ item }) => item.category === test.category)) {
    throw new Error(`Search regression: ${test.query} did not surface ${test.category}; top categories=${top.map(({ item }) => item.category).join(',')}`);
  }
}

for (const [canonical, variants] of Object.entries(searchConfig.phraseAliases || {})) {
  if (!canonical || !Array.isArray(variants) || variants.length === 0) throw new Error(`Invalid phrase alias configuration for ${canonical}`);
}

console.log(`Search regression passed: ${cases.length} representative queries across ${items.length} knowledge entries.`);
