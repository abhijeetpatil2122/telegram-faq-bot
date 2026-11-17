import fs from 'node:fs';
import path from 'node:path';
import { searchKnowledge } from '../search-engine.mjs';

const root = path.resolve(process.cwd());
const knowledge = JSON.parse(fs.readFileSync(path.join(root, 'data', 'knowledge.json'), 'utf8'));

const positiveCases = [
  ['How do I change my phone number?', ['telegram-faq', 'telegram-privacy']],
  ['Who can see my phone number?', ['telegram-privacy', 'telegram-faq']],
  ['How do I delete my Telegram account?', ['telegram-faq', 'telegram-privacy']],
  ['How do I log in to Telegram?', ['telegram-faq', 'telegram-blog-member-tags-disable-sharing-and-more']],
  ['How do I enable two step verification?', ['telegram-faq']],
  ['What is Telegram Premium?', ['telegram-faq-premium']],
  ['How do Premium subscriptions work?', ['telegram-faq-premium']],
  ['How do I create a channel?', ['telegram-faq-channels', 'telegram-faq']],
  ['How do channel administrators work?', ['telegram-faq-channels']],
  ['What is Telegram spam?', ['telegram-faq-spam']],
  ['Why was my account limited for spam?', ['telegram-faq-spam']],
  ['How do I report spam?', ['telegram-faq-spam']],
  ['What are Telegram Stars?', ['telegram-stars']],
  ['How do I pay with Telegram Stars?', ['telegram-stars']],
  ['What are Telegram Gifts?', ['telegram-gifts']],
  ['How do collectible gifts work?', ['telegram-gifts', 'telegram-gift-marketplace']],
  ['What is the Telegram Gift Marketplace?', ['telegram-gift-marketplace']],
  ['How do stories work in channels?', ['telegram-stories', 'telegram-live-stories']],
  ['What are Live Stories?', ['telegram-live-stories']],
  ['How do story albums work?', ['telegram-search']],
  ['How do I search public posts?', ['telegram-search']],
  ['What is public post search?', ['telegram-search']],
  ['What are Telegram communities?', ['telegram-communities']],
  ['What is the rich text editor?', ['telegram-communities']],
  ['How do ephemeral messages work in groups?', ['telegram-communities', 'telegram-blog-watch-apps-and-more', 'telegram-blog-comments-in-video-chats-threads-for-bots', 'telegram-blog-group-calls-made-easy']],
  ['What are the Telegram Terms of Service?', ['telegram-tos']],
  ['What terms apply when I use a Telegram bot?', ['telegram-tos-bots']],
  ['What are the terms for Telegram Mini Apps?', ['telegram-tos-mini-apps']],
  ['Can I scrape Telegram public content to train an AI model?', ['telegram-tos-content-licensing']],
  ['What are the rules for buying and spending Stars?', ['telegram-tos-stars']],
  ['What terms apply to Telegram Business subscriptions?', ['telegram-tos-business']],
  ['What are the Telegram content creator terms?', ['telegram-tos-content-creators']],
  ['What are my rights under the EU Digital Services Act on Telegram?', ['telegram-tos-eu-dsa']]
];

const noResultCases = [
  'quantum banana taxation',
  'mars colony oxygen accounting',
  'underwater chess engine firmware',
  'purple satellite insurance calculator',
  'ancient roman wifi password',
  'volcanic keyboard battery chemistry',
  'neutron star gardening schedule',
  'desert submarine parking permit',
  'robot dinosaur weather certificate',
  'crystal pineapple database migration'
];

const TOP_K = [1, 3, 5];
const MIN_SCORE = 24;

function hasExpectedSource(results, expectedSources) {
  const allowed = new Set(expectedSources);
  return results.some((item) => allowed.has(item.source?.id));
}

let top1 = 0;
let top3 = 0;
let top5 = 0;
let positiveFailures = 0;

for (const [query, expectedSources] of positiveCases) {
  const results = searchKnowledge(knowledge.items, query, { minScore: MIN_SCORE });
  const ok1 = hasExpectedSource(results.slice(0, TOP_K[0]), expectedSources);
  const ok3 = hasExpectedSource(results.slice(0, TOP_K[1]), expectedSources);
  const ok5 = hasExpectedSource(results.slice(0, TOP_K[2]), expectedSources);
  if (ok1) top1 += 1;
  if (ok3) top3 += 1;
  if (ok5) top5 += 1;
  if (!ok5) {
    positiveFailures += 1;
    console.error(`FAIL: ${query}`);
    console.error(`  expected: ${expectedSources.join(', ')}`);
    console.error(`  got: ${results.slice(0, 5).map((item) => item.source?.id).join(', ') || '(none)'}`);
  }
}

let noResultCorrect = 0;
for (const query of noResultCases) {
  const results = searchKnowledge(knowledge.items, query, { minScore: MIN_SCORE });
  if (!results.length) noResultCorrect += 1;
  else {
    console.error(`FALSE POSITIVE: ${query}`);
    console.error(`  got: ${results.slice(0, 3).map((item) => item.source?.id).join(', ')}`);
  }
}

const totalPositive = positiveCases.length;
const totalNoResult = noResultCases.length;
const metrics = {
  positiveQueries: totalPositive,
  noResultQueries: totalNoResult,
  top1Accuracy: top1 / totalPositive,
  top3Accuracy: top3 / totalPositive,
  top5Accuracy: top5 / totalPositive,
  noResultAccuracy: noResultCorrect / totalNoResult,
  falsePositiveRate: (totalNoResult - noResultCorrect) / totalNoResult
};

console.log(`Search benchmark: ${totalPositive} positive + ${totalNoResult} no-result queries`);
console.log(`  Top-1 accuracy: ${(metrics.top1Accuracy * 100).toFixed(1)}%`);
console.log(`  Top-3 accuracy: ${(metrics.top3Accuracy * 100).toFixed(1)}%`);
console.log(`  Top-5 accuracy: ${(metrics.top5Accuracy * 100).toFixed(1)}%`);
console.log(`  No-result accuracy: ${(metrics.noResultAccuracy * 100).toFixed(1)}%`);
console.log(`  False-positive rate: ${(metrics.falsePositiveRate * 100).toFixed(1)}%`);

const thresholds = {
  top1Accuracy: 0.60,
  top3Accuracy: 0.85,
  top5Accuracy: 0.90,
  noResultAccuracy: 0.90,
  falsePositiveRate: 0.10
};

const failedThresholds = Object.entries(thresholds).filter(([key, minimumOrMaximum]) => {
  if (key === 'falsePositiveRate') return metrics[key] > minimumOrMaximum;
  return metrics[key] < minimumOrMaximum;
});

if (positiveFailures || failedThresholds.length) {
  if (failedThresholds.length) console.error(`Benchmark thresholds failed: ${failedThresholds.map(([key, value]) => `${key}=${value}`).join(', ')}`);
  process.exit(1);
}

console.log('Search benchmark passed.');
