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
  return String(value)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value) {
  return [...new Set(normalize(value).split(' ').filter(Boolean))];
}

function queryTokens(query) {
  return tokens(query).filter((token) => token.length >= 2 && !STOPWORDS.has(token));
}

function tokenSet(value) {
  return new Set(tokens(value));
}

function phrasePresent(field, phrase) {
  return Boolean(field && phrase && (` ${field} `).includes(` ${phrase} `));
}

function coverage(queryTokensList, field) {
  if (!queryTokensList.length || !field) return 0;
  const fieldTokens = tokenSet(field);
  return queryTokensList.filter((token) => fieldTokens.has(token)).length;
}

function expandQuery(query) {
  const normalized = normalize(query);
  const variants = new Set([normalized]);
  const phraseAliases = SEARCH_CONFIG.phraseAliases ?? {};

  for (const [canonical, aliases] of Object.entries(phraseAliases)) {
    const normalizedCanonical = normalize(canonical);
    const normalizedAliases = (aliases ?? []).map(normalize).filter(Boolean);
    if (phrasePresent(normalized, normalizedCanonical) || normalizedAliases.some((alias) => phrasePresent(normalized, alias))) {
      variants.add(normalizedCanonical);
      for (const alias of normalizedAliases) variants.add(alias);
    }
  }

  return [...variants].filter(Boolean);
}

function detectCategories(query) {
  const normalized = normalize(query);
  const detected = new Set();
  for (const [category, aliases] of Object.entries(SEARCH_CONFIG.categoryAliases ?? {})) {
    if ((aliases ?? []).map(normalize).some((alias) => phrasePresent(normalized, alias))) detected.add(category);
  }
  return detected;
}

function fieldsFor(item) {
  return {
    question: normalize(item.question ?? ''),
    title: normalize(item.title ?? ''),
    section: normalize(item.section ?? ''),
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

function score(item, query) {
  const normalizedQuery = normalize(query);
  const baseTokens = queryTokens(query);
  if (!normalizedQuery || !baseTokens.length) return 0;

  const fields = fieldsFor(item);
  const variants = expandQuery(query);
  const detectedCategories = detectCategories(query);
  const primary = fields.question || fields.title;
  const primaryTokens = tokenSet(primary);
  const uniqueTokenCount = baseTokens.length;
  const matchedPrimary = coverage(baseTokens, primary);
  const matchedTitle = coverage(baseTokens, fields.title);
  const matchedSection = coverage(baseTokens, fields.section);
  const matchedAliases = coverage(baseTokens, fields.aliases.join(' '));
  const matchedKeywords = coverage(baseTokens, fields.keywords.join(' '));
  const allSearchFields = [fields.question, fields.title, fields.section, ...fields.aliases, ...fields.keywords];
  let points = 0;

  if (fields.question === normalizedQuery) points += 1000;
  if (fields.title === normalizedQuery) points += 900;
  if (fields.section === normalizedQuery) points += 700;

  for (const variant of variants) {
    if (variant === normalizedQuery) continue;
    if (fields.question === variant) points += 520;
    if (fields.title === variant) points += 460;
    if (fields.aliases.some((alias) => alias === variant)) points += 430;
  }

  if (containsPhraseAny(fields.question, variants)) points += 420;
  if (containsPhraseAny(fields.title, variants)) points += 360;
  if (containsPhraseAny(fields.section, variants)) points += 220;
  if (fields.aliases.some((field) => containsPhraseAny(field, variants))) points += 300;
  if (fields.keywords.some((field) => containsPhraseAny(field, variants))) points += 180;

  if (fields.question.startsWith(normalizedQuery)) points += 260;
  else if (fields.title.startsWith(normalizedQuery)) points += 220;
  else if (fields.section.startsWith(normalizedQuery)) points += 140;

  if (fields.question.includes(normalizedQuery)) points += 140;
  if (fields.title.includes(normalizedQuery)) points += 120;
  if (fields.section.includes(normalizedQuery)) points += 80;

  points += matchedPrimary * 90;
  points += matchedTitle * 65;
  points += matchedSection * 35;
  points += matchedAliases * 45;
  points += matchedKeywords * 20;

  if (matchedPrimary === uniqueTokenCount) points += 260;
  else if (matchedPrimary >= Math.max(1, uniqueTokenCount - 1)) points += 100;

  const matchedAny = baseTokens.filter((token) => allSearchFields.some((field) => tokenSet(field).has(token))).length;
  if (matchedAny === uniqueTokenCount) points += 120;
  else if (matchedAny < Math.ceil(uniqueTokenCount / 2)) points -= 35;

  if (primaryTokens.size && matchedPrimary === primaryTokens.size && primaryTokens.size <= uniqueTokenCount) points += 45;

  if (detectedCategories.has(String(item.category ?? '').toUpperCase())) points += 115;

  const developerIntent = baseTokens.some((token) => DEV_INTENT.has(token));
  if (developerIntent && fields.audience === 'developer') points += 55;
  if (!developerIntent && fields.audience === 'developer') points -= 8;

  // Source priority is a tie-breaker signal, never a replacement for relevance.
  points += Math.round(sourcePriority(item) * 0.35);

  return points;
}

function containsPhraseAny(field, variants) {
  return variants.some((variant) => phrasePresent(field, variant));
}

export function searchKnowledge(knowledge, query, { minScore = 24 } = {}) {
  if (!normalize(query)) return [...knowledge];
  return knowledge
    .map((item) => ({ item, score: score(item, query) }))
    .filter(({ score: itemScore }) => itemScore >= minScore)
    .sort((a, b) => b.score - a.score || sourcePriority(b.item) - sourcePriority(a.item) || (a.item.question ?? a.item.title ?? '').localeCompare(b.item.question ?? b.item.title ?? ''))
    .map(({ item }) => item);
}

export { normalize, queryTokens, detectCategories, score };
