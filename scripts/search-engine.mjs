import fs from 'node:fs';
import path from 'node:path';

const CONFIG_PATH = path.join(process.cwd(), 'config', 'search.json');
const SEARCH_CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'because', 'been', 'before', 'but', 'by',
  'can', 'could', 'did', 'do', 'does', 'for', 'from', 'had', 'has', 'have', 'how', 'i',
  'if', 'in', 'into', 'is', 'it', 'its', 'me', 'more', 'most', 'my', 'no', 'not', 'of',
  'on', 'or', 'our', 'please', 'should', 'so', 'than', 'that', 'the', 'their', 'them',
  'there', 'these', 'they', 'this', 'to', 'was', 'we', 'were', 'what', 'when', 'where',
  'which', 'who', 'why', 'will', 'with', 'you', 'your', 'tell'
]);

const DEV_INTENT = new Set([
  'api', 'bot', 'bots', 'token', 'webhook', 'inline', 'query', 'mini', 'app', 'apps',
  'developer', 'developers', 'code', 'coding', 'payload', 'json', 'callback', 'business'
]);

function normalize(value = '') {
  return String(value).toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}
function tokens(value) { return [...new Set(normalize(value).split(' ').filter(Boolean))]; }
function queryTokens(query) { return tokens(query).filter((token) => token.length >= 2 && !STOPWORDS.has(token)); }
function tokenSet(value) { return new Set(tokens(value)); }
function phrasePresent(field, phrase) { return Boolean(field && phrase && (` ${field} `).includes(` ${phrase} `)); }
function coverage(queryTokensList, field) {
  if (!queryTokensList.length || !field) return 0;
  const fieldTokens = tokenSet(field);
  return queryTokensList.filter((token) => fieldTokens.has(token)).length;
}
function replacePhrase(text, from, to) {
  if (!text || !from || !to || text === from) return text;
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, 'g'), `$1${to}`);
}
function expandQuery(query) {
  const normalized = normalize(query);
  const variants = new Set([normalized]);
  for (const [canonical, aliases] of Object.entries(SEARCH_CONFIG.phraseAliases ?? {})) {
    const normalizedCanonical = normalize(canonical);
    const normalizedAliases = (aliases ?? []).map(normalize).filter(Boolean);
    const matched = phrasePresent(normalized, normalizedCanonical) || normalizedAliases.some((alias) => phrasePresent(normalized, alias));
    if (!matched) continue;
    variants.add(normalizedCanonical);
    for (const alias of normalizedAliases) {
      variants.add(alias);
      variants.add(replacePhrase(normalized, alias, normalizedCanonical));
      variants.add(replacePhrase(normalized, normalizedCanonical, alias));
    }
  }
  for (const [canonical, aliases] of Object.entries(SEARCH_CONFIG.termAliases ?? {})) {
    const normalizedCanonical = normalize(canonical);
    const normalizedAliases = (aliases ?? []).map(normalize).filter(Boolean);
    const matched = phrasePresent(normalized, normalizedCanonical) || normalizedAliases.some((alias) => phrasePresent(normalized, alias));
    if (!matched) continue;
    variants.add(normalizedCanonical);
    for (const alias of normalizedAliases) {
      variants.add(alias);
      variants.add(replacePhrase(normalized, alias, normalizedCanonical));
      variants.add(replacePhrase(normalized, normalizedCanonical, alias));
    }
  }
  return [...variants].filter(Boolean);
}
function detectCategories(query) {
  const normalized = normalize(query);
  const detected = new Set();
  for (const [category, aliases] of Object.entries(SEARCH_CONFIG.categoryAliases ?? {})) {
    if ((aliases ?? []).map(normalize).some((alias) => phrasePresent(normalized, alias))) detected.add(category.toUpperCase());
  }
  return detected;
}
function detectIntents(query) {
  const normalized = normalize(query);
  const detected = new Set();
  for (const [intent, patterns] of Object.entries(SEARCH_CONFIG.intentPatterns ?? {})) {
    if ((patterns ?? []).map(normalize).some((pattern) => phrasePresent(normalized, pattern))) detected.add(intent);
  }
  return detected;
}
function fieldsFor(item) {
  return {
    question: normalize(item.question ?? ''),
    title: normalize(item.title ?? ''),
    section: normalize(item.section ?? ''),
    sourceTitle: normalize(item.source?.title ?? ''),
    aliases: (item.aliases ?? []).map(normalize).filter(Boolean),
    keywords: (item.keywords ?? []).map(normalize).filter(Boolean),
    category: normalize(item.category ?? ''),
    audience: normalize(item.metadata?.audience ?? '')
  };
}
function sourcePriority(item) {
  const priority = Number(item.metadata?.priority ?? 0);
  return Number.isFinite(priority) ? Math.max(0, Math.min(priority, 100)) : 0;
}
function editDistance(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  if (Math.abs(a.length - b.length) > 2) return 3;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      const insertion = current[j - 1] + 1;
      const deletion = previous[j] + 1;
      current[j] = Math.min(substitution, insertion, deletion);
    }
    previous = current;
  }
  return previous[b.length];
}
function fuzzySimilarity(a, b) {
  if (a === b || a.length < 5 || b.length < 5) return 0;
  if (Math.abs(a.length - b.length) > 2) return 0;
  const distance = editDistance(a, b);
  if (distance > 2) return 0;
  return 1 - (distance / Math.max(a.length, b.length));
}
function fuzzyMatchScore(queryTokenList, fields) {
  const exactTokens = new Set();
  for (const field of fields) for (const token of tokens(field)) exactTokens.add(token);
  const fieldTokenLists = fields.map((field) => tokens(field));
  let primaryScore = 0;
  let anyScore = 0;
  let matched = 0;
  for (const queryToken of queryTokenList) {
    if (exactTokens.has(queryToken)) continue;
    let best = 0;
    let bestField = -1;
    for (let fieldIndex = 0; fieldIndex < fieldTokenLists.length; fieldIndex += 1) {
      for (const fieldToken of fieldTokenLists[fieldIndex]) {
        const similarity = fuzzySimilarity(queryToken, fieldToken);
        if (similarity > best) { best = similarity; bestField = fieldIndex; }
      }
    }
    if (best >= 0.84) {
      matched += 1;
      anyScore += best;
      if (bestField === 0) primaryScore += best;
    }
  }
  return { matched, primaryScore, anyScore };
}
function intentScore(intents, fields) {
  if (!intents.size) return 0;
  const primary = fields.question || fields.title;
  let points = 0;
  if (intents.has('how_to') && /^(how|create|enable|disable|set up|configure|use)\b/.test(primary)) points += 28;
  if (intents.has('definition') && /^(what|about|define|meaning)\b/.test(primary)) points += 28;
  if (intents.has('troubleshooting') && /\b(why|error|failed|problem|issue|cannot|can't|not working|missing)\b/.test(primary)) points += 32;
  if (intents.has('privacy') && fields.category === 'privacy') points += 35;
  if (intents.has('developer') && fields.audience === 'developer') points += 35;
  return points;
}
function score(item, query) {
  const normalizedQuery = normalize(query);
  const baseTokens = queryTokens(query);
  if (!normalizedQuery || !baseTokens.length) return 0;
  const fields = fieldsFor(item);
  const variants = expandQuery(query);
  const detectedCategories = detectCategories(query);
  const detectedIntents = detectIntents(query);
  const primary = fields.question || fields.title;
  const primaryTokens = tokenSet(primary);
  const uniqueTokenCount = baseTokens.length;
  const matchedPrimary = coverage(baseTokens, primary);
  const matchedTitle = coverage(baseTokens, fields.title);
  const matchedSection = coverage(baseTokens, fields.section);
  const matchedSourceTitle = coverage(baseTokens, fields.sourceTitle);
  const matchedAliases = coverage(baseTokens, fields.aliases.join(' '));
  const matchedKeywords = coverage(baseTokens, fields.keywords.join(' '));
  const allSearchFields = [fields.question, fields.title, fields.section, fields.sourceTitle, ...fields.aliases, ...fields.keywords];
  let points = 0;
  if (fields.question === normalizedQuery) points += 1000;
  if (fields.title === normalizedQuery) points += 900;
  if (fields.section === normalizedQuery) points += 700;
  if (fields.sourceTitle === normalizedQuery) points += 650;
  for (const variant of variants) {
    if (variant === normalizedQuery) continue;
    if (fields.question === variant) points += 520;
    if (fields.title === variant) points += 460;
    if (fields.aliases.some((alias) => alias === variant)) points += 430;
  }
  if (containsPhraseAny(fields.question, variants)) points += 420;
  if (containsPhraseAny(fields.title, variants)) points += 360;
  if (containsPhraseAny(fields.section, variants)) points += 220;
  if (containsPhraseAny(fields.sourceTitle, variants)) points += 260;
  if (fields.aliases.some((field) => containsPhraseAny(field, variants))) points += 300;
  if (fields.keywords.some((field) => containsPhraseAny(field, variants))) points += 180;
  if (fields.question.startsWith(normalizedQuery)) points += 260;
  else if (fields.title.startsWith(normalizedQuery)) points += 220;
  else if (fields.section.startsWith(normalizedQuery)) points += 140;
  else if (fields.sourceTitle.startsWith(normalizedQuery)) points += 120;
  if (fields.question.includes(normalizedQuery)) points += 140;
  if (fields.title.includes(normalizedQuery)) points += 120;
  if (fields.section.includes(normalizedQuery)) points += 80;
  if (fields.sourceTitle.includes(normalizedQuery)) points += 70;
  points += matchedPrimary * 90;
  points += matchedTitle * 65;
  points += matchedSection * 35;
  points += matchedSourceTitle * 55;
  points += matchedAliases * 45;
  points += matchedKeywords * 20;
  if (matchedPrimary === uniqueTokenCount) points += 260;
  else if (matchedPrimary >= Math.max(1, uniqueTokenCount - 1)) points += 100;
  const matchedAny = baseTokens.filter((token) => allSearchFields.some((field) => tokenSet(field).has(token))).length;
  if (matchedAny === uniqueTokenCount) points += 120;
  else if (matchedAny < Math.ceil(uniqueTokenCount / 2)) points -= 35;
  const fuzzy = fuzzyMatchScore(baseTokens, [primary, fields.title, fields.section, fields.sourceTitle, ...fields.aliases, ...fields.keywords]);
  points += Math.round(fuzzy.primaryScore * 85);
  points += Math.round(fuzzy.anyScore * 18);
  if (fuzzy.matched === uniqueTokenCount && fuzzy.matched > 0) points += 80;
  if (primaryTokens.size && matchedPrimary === primaryTokens.size && primaryTokens.size <= uniqueTokenCount) points += 45;
  if (detectedCategories.has(String(item.category ?? '').toUpperCase())) points += 115;
  const developerIntent = baseTokens.some((token) => DEV_INTENT.has(token)) || detectedIntents.has('developer');
  if (developerIntent && fields.audience === 'developer') points += 55;
  if (!developerIntent && fields.audience === 'developer') points -= 8;
  points += intentScore(detectedIntents, fields);
  points += Math.round(sourcePriority(item) * 0.35);
  return points;
}
function containsPhraseAny(field, variants) { return variants.some((variant) => phrasePresent(field, variant)); }
function effectiveMinScore(query, configured) {
  const base = Number.isFinite(Number(configured)) ? Number(configured) : 24;
  const count = queryTokens(query).length;
  if (count <= 1) return Math.max(18, base - 6);
  if (count === 2) return Math.max(20, base - 3);
  if (count >= 5) return base + 3;
  return base;
}
function diversifyScoredResults(scored, limit = 20) {
  if (scored.length <= 1) return scored;
  const remaining = [...scored];
  const selected = [];
  const sourceCounts = new Map();
  const categoryCounts = new Map();
  while (remaining.length && selected.length < Math.min(limit, scored.length)) {
    let bestIndex = 0;
    let bestAdjusted = -Infinity;
    for (let index = 0; index < remaining.length; index += 1) {
      const candidate = remaining[index];
      const sourceId = candidate.item.source?.id ?? '';
      const category = String(candidate.item.category ?? '').toUpperCase();
      let adjusted = candidate.score;
      if (selected.length > 0) {
        adjusted -= Math.min(18, (sourceCounts.get(sourceId) ?? 0) * 9);
        adjusted -= Math.min(8, (categoryCounts.get(category) ?? 0) * 4);
      }
      const currentBest = remaining[0].score;
      if (candidate.score < currentBest * 0.72) adjusted -= 40;
      if (adjusted > bestAdjusted) { bestAdjusted = adjusted; bestIndex = index; }
    }
    const [picked] = remaining.splice(bestIndex, 1);
    selected.push(picked);
    const sourceId = picked.item.source?.id ?? '';
    const category = String(picked.item.category ?? '').toUpperCase();
    sourceCounts.set(sourceId, (sourceCounts.get(sourceId) ?? 0) + 1);
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  }
  return [...selected, ...remaining];
}
export function searchKnowledge(knowledge, query, { minScore = 24, diversify = true } = {}) {
  if (!normalize(query)) return [...knowledge];
  const threshold = effectiveMinScore(query, minScore);
  const scored = knowledge.map((item) => ({ item, score: score(item, query) }))
    .filter(({ score: itemScore }) => itemScore >= threshold)
    .sort((a, b) => b.score - a.score || sourcePriority(b.item) - sourcePriority(a.item) || (a.item.question ?? a.item.title ?? '').localeCompare(b.item.question ?? b.item.title ?? ''));
  const ranked = diversify ? diversifyScoredResults(scored) : scored;
  return ranked.map(({ item }) => item);
}
export { normalize, queryTokens, detectCategories, detectIntents, score };
