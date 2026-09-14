// Telegram Help Desk runtime — admin panel and production hardening verified by CI.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { searchKnowledge as retrieveKnowledge } from '../scripts/search-engine.mjs';

const KNOWLEDGE_PATH = path.join(process.cwd(), 'data', 'knowledge.json');
const CRAWL_STATE_PATH = path.join(process.cwd(), 'data', 'crawl-state.json');
const MAX_RESULTS = 50;
const MIN_SCORE = 24;
const INLINE_CACHE_TIME = 0;
const ARTICLE_THUMBNAIL_URL = 'https://image.zaw-myo.workers.dev/file/dc44d72e-a7b8-45f2-b249-a6bcaa6720c0';
const HELP_THUMBNAIL_URL = 'https://image.zaw-myo.workers.dev/file/510c3a83-8a96-416c-b1ea-a37dddb6638f';
const NO_RESULTS_THUMBNAIL_URL = 'https://image.zaw-myo.workers.dev/file/6132b4a1-1e93-41a7-a76f-fa199577ad90';
const DEFAULT_BOT_USERNAME = 'TeleFQBot';
const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;
const TELEGRAM_REQUEST_TIMEOUT_MS = 7000;
const TELEGRAM_MAX_ATTEMPTS = 2;
const TELEGRAM_RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const TELEGRAM_MAX_RETRY_AFTER_MS = 5000;
const MAX_TRACKED_UPDATES = 5000;
const PROCESSED_UPDATE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_RICH_MESSAGE_BYTES = 32768;
const RICH_FALLBACK_BYTES = 30000;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY ?? 'abhijeetpatil2122/telegram-faq-bot';
const GITHUB_WORKFLOW = process.env.GITHUB_WORKFLOW ?? 'update-faq.yml';
const GITHUB_API_VERSION = '2026-03-10';
const ADMIN_IDS = new Set(
  String(process.env.ADMIN_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => /^\d+$/.test(value))
);

const processedUpdates = new Map();
const inFlightUpdates = new Map();

function loadKnowledge() {
  try {
    const data = JSON.parse(fs.readFileSync(KNOWLEDGE_PATH, 'utf8'));
    return Array.isArray(data.items) ? data.items : [];
  } catch (error) {
    console.error('Unable to load knowledge dataset:', error);
    return [];
  }
}

function loadCrawlState() {
  try {
    return JSON.parse(fs.readFileSync(CRAWL_STATE_PATH, 'utf8'));
  } catch (error) {
    console.error('Unable to load crawl state:', error);
    return null;
  }
}

const KNOWLEDGE = loadKnowledge();
let botProfilePromise = null;

function paginate(items, offset) {
  const parsed = Number.parseInt(offset || '0', 10);
  const start = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  const results = items.slice(start, start + MAX_RESULTS);
  return { results, next_offset: start + results.length < items.length ? String(start + results.length) : '' };
}

function htmlEscape(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function safeResultId(prefix, value) {
  return `${prefix}-${createHash('sha256').update(String(value)).digest('hex').slice(0, 32)}`;
}

function safeButtonUrl(value) {
  let raw = String(value ?? '').trim();
  if (!raw || /^(?:javascript|data|vbscript):/i.test(raw)) return null;
  if (/^[\w.-]+\.[A-Za-z]{2,}(?::\d+)?(?:[/?#]|$)/.test(raw)) raw = `https://${raw}`;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' && url.protocol !== 'http:' && url.protocol !== 'tg:') return null;
    if (!url.hostname && url.protocol !== 'tg:') return null;
    return url.href;
  } catch {
    return null;
  }
}

function richUrlButton(label, href, style = 'primary') {
  const url = safeButtonUrl(href);
  if (!url) return null;
  const safeLabel = String(label ?? '').replace(/\s+/g, ' ').trim().slice(0, 180) || 'Open link';
  return `<tg-button type="url" style="${style}" url="${htmlEscape(url)}">${htmlEscape(safeLabel)}</tg-button>`;
}

function promoteExternalLinks(html) {
  const sourceHtml = String(html ?? '');
  const tableParts = sourceHtml.split(/(<table\b[\s\S]*?<\/table>)/gi);
  return tableParts.map((part) => {
    if (/^<table\b/i.test(part)) return part;
    return part.replace(/<a\b([^>]*?)\bhref=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi, (match, before, href, after, labelHtml) => {
      const label = String(labelHtml).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const button = richUrlButton(label, href, 'primary');
      return button ?? match;
    });
  }).join('');
}

function renderAnswerHtml(item) {
  const html = String(item.answer_html ?? '').trim();
  if (!html) return `<p>${htmlEscape(item.answer ?? 'No answer text is available for this entry.')}</p>`;
  return promoteExternalLinks(html);
}

function formatCategoryName(value) {
  return String(value ?? '')
    .trim()
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\p{L}/gu, (char) => char.toUpperCase());
}

function sourceFooter(item) {
  const sourceTitle = item.source?.title ?? 'Official Telegram source';
  const sourceUrl = safeButtonUrl(item.source?.url);
  const button = sourceUrl ? richUrlButton(sourceTitle, sourceUrl, 'primary') : null;
  return button
    ? `<footer>Source: ${button}</footer>`
    : `<footer>Source: ${htmlEscape(sourceTitle)}</footer>`;
}

function niceDescription(item) {
  const source = item.source?.title ?? 'Official Telegram source';
  const section = item.section && item.section !== item.title ? ` • ${item.section}` : '';
  const category = item.category ? ` • ${formatCategoryName(item.category)}` : '';
  return `${source}${section}${category} • Official documentation`.slice(0, 255);
}

function renderRichAnswer(item) {
  const title = item.question ?? item.title ?? 'Telegram documentation';
  const category = item.category
    ? `<blockquote><b>Category:</b> ${htmlEscape(formatCategoryName(item.category))}</blockquote>`
    : '';
  return [
    `<h2>❓ ${htmlEscape(title)}</h2>`,
    category,
    `<details><summary>Answer</summary>${renderAnswerHtml(item)}</details>`,
    '<hr/>',
    sourceFooter(item)
  ].filter(Boolean).join('\n');
}

function richByteLength(value) {
  return Buffer.byteLength(String(value ?? ''), 'utf8');
}

function truncateUtf8(value, maxBytes) {
  let result = String(value ?? '');
  if (richByteLength(result) <= maxBytes) return result;
  while (result && richByteLength(`${result}…`) > maxBytes) result = result.slice(0, -1);
  return `${result}…`;
}

function plainTextFromHtml(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function fitRichMessage(html, fallbackText = '') {
  const source = String(html ?? '');
  if (richByteLength(source) <= MAX_RICH_MESSAGE_BYTES) return source;
  const safeText = truncateUtf8(plainTextFromHtml(fallbackText || source), RICH_FALLBACK_BYTES);
  return `<p>${htmlEscape(safeText)}</p>`;
}

function noResultsContent() {
  return {
    rich_message: {
      html: [
        '<footer>No matching answer was found in the official Telegram knowledge base.</footer>',
        '<tg-button-row align="left"><tg-button type="switch_inline_query_current_chat" style="primary" query="">🔎 Search again</tg-button></tg-button-row>'
      ].join('\n')
    }
  };
}

function noResultsHelpArticle() {
  return {
    type: 'article',
    id: safeResultId('search-help', 'static'),
    title: 'How to search this bot',
    description: 'Search the official Telegram knowledge base.',
    thumbnail_url: HELP_THUMBNAIL_URL,
    input_message_content: {
      rich_message: {
        html: [
          '<footer>Ask a short, specific question about Telegram, bots, Bot API features or official bot terms.</footer>',
          '<tg-button-row align="left"><tg-button type="switch_inline_query_current_chat" style="primary" query="">🔎 Search again</tg-button></tg-button-row>'
        ].join('\n')
      }
    }
  };
}

function inlineResults(query, offset) {
  const safeQuery = String(query ?? '').slice(0, 256);
  const allMatches = retrieveKnowledge(KNOWLEDGE, safeQuery, { minScore: MIN_SCORE });
  if (!allMatches.length) {
    if (offset) return { results: [], next_offset: '' };
    return {
      results: [
        {
          type: 'article',
          id: safeResultId('no-results', safeQuery || 'empty'),
          title: safeQuery.trim() ? `No results for “${safeQuery.trim().slice(0, 60)}”` : 'No results found',
          description: 'No matching information in the official Telegram sources.',
          thumbnail_url: NO_RESULTS_THUMBNAIL_URL,
          input_message_content: noResultsContent(safeQuery)
        },
        noResultsHelpArticle()
      ],
      next_offset: ''
    };
  }

  const page = paginate(allMatches, offset);
  return {
    results: page.results.map((item) => ({
      type: 'article',
      id: safeResultId('faq', item.id ?? item.question ?? item.title),
      title: String(item.question ?? item.title ?? 'Telegram documentation').slice(0, 256),
      description: niceDescription(item),
      thumbnail_url: ARTICLE_THUMBNAIL_URL,
      input_message_content: {
        rich_message: {
          html: fitRichMessage(renderRichAnswer(item), item.answer ?? item.answer_html ?? '')
        }
      }
    })),
    next_offset: String(page.next_offset ?? '').slice(0, 64)
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function telegram(method, payload) {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error('BOT_TOKEN is not configured');

  let lastError;
  for (let attempt = 1; attempt <= TELEGRAM_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TELEGRAM_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const body = await response.json().catch(() => null);
      if (response.ok && body?.ok !== false) return body;

      const error = new Error(`Telegram ${method} failed: HTTP ${response.status} ${body?.description ?? ''}`.trim());
      error.status = response.status;
      error.description = body?.description ?? '';
      error.retryAfter = Number.isFinite(body?.parameters?.retry_after) ? body.parameters.retry_after : null;
      lastError = error;

      if (!TELEGRAM_RETRYABLE_STATUSES.has(error.status) || attempt >= TELEGRAM_MAX_ATTEMPTS) throw error;
      const retryAfterMs = error.status === 429 && error.retryAfter != null
        ? Math.min(Math.max(0, error.retryAfter * 1000), TELEGRAM_MAX_RETRY_AFTER_MS)
        : 250;
      await sleep(retryAfterMs);
    } catch (error) {
      if (error?.name === 'AbortError') {
        lastError = new Error(`Telegram ${method} timed out after ${TELEGRAM_REQUEST_TIMEOUT_MS}ms`);
        lastError.status = 408;
      } else {
        lastError = error;
      }
      if (attempt >= TELEGRAM_MAX_ATTEMPTS) throw lastError;
      if (lastError?.status && !TELEGRAM_RETRYABLE_STATUSES.has(lastError.status)) throw lastError;
      await sleep(250);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error(`Telegram ${method} failed`);
}

function isExpiredInlineQueryError(error) {
  return error?.status === 400 && /query is too old|response timeout expired|query id is invalid/i.test(error?.description ?? error?.message ?? '');
}

function isExpiredCallbackQueryError(error) {
  return error?.status === 400 && /query is too old|response timeout expired|query ID is invalid/i.test(error?.description ?? error?.message ?? '');
}

async function answerCallbackQuerySafe(callbackId, payload = {}) {
  try {
    await telegram('answerCallbackQuery', { callback_query_id: callbackId, ...payload });
  } catch (error) {
    if (!isExpiredCallbackQueryError(error)) throw error;
    console.warn('Ignoring expired callback query:', error.description ?? error.message);
  }
}

async function triggerCrawlWorkflow() {
  const token = String(process.env.GITHUB_TOKEN ?? '').trim();
  if (!token) throw new Error('GITHUB_TOKEN is not configured for manual crawl control');
  const url = `https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/workflows/${encodeURIComponent(GITHUB_WORKFLOW)}/dispatches`;
  const response = await fetch(url, { method: 'POST', headers: { accept: 'application/vnd.github+json', authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-github-api-version': GITHUB_API_VERSION }, body: JSON.stringify({ ref: 'main' }) });
  if (!response.ok) { const body = await response.text().catch(() => ''); throw new Error(`GitHub workflow dispatch failed: HTTP ${response.status} ${body}`.trim()); }
}

function cleanupProcessedUpdates(now = Date.now()) {
  for (const [updateId, timestamp] of processedUpdates) {
    if (now - timestamp > PROCESSED_UPDATE_TTL_MS) processedUpdates.delete(updateId);
  }
  while (processedUpdates.size > MAX_TRACKED_UPDATES) {
    const oldest = processedUpdates.keys().next().value;
    if (oldest === undefined) break;
    processedUpdates.delete(oldest);
  }
}

function hasProcessedUpdate(updateId) {
  cleanupProcessedUpdates();
  return processedUpdates.has(updateId);
}

function markProcessedUpdate(updateId) {
  cleanupProcessedUpdates();
  processedUpdates.set(updateId, Date.now());
  cleanupProcessedUpdates();
}

async function processUpdateOnce(updateId, processor) {
  if (hasProcessedUpdate(updateId)) return false;
  if (inFlightUpdates.has(updateId)) {
    await inFlightUpdates.get(updateId);
    return false;
  }

  const promise = (async () => {
    await processor();
    markProcessedUpdate(updateId);
  })();
  inFlightUpdates.set(updateId, promise);
  try {
    await promise;
  } finally {
    inFlightUpdates.delete(updateId);
  }
  return true;
}

function parseWebhookBody(request) {
  const raw = request.body;
  if (raw && typeof raw === 'object' && !Buffer.isBuffer(raw)) return raw;
  if (Buffer.isBuffer(raw)) {
    if (raw.length > MAX_WEBHOOK_BODY_BYTES) throw Object.assign(new Error('Webhook body is too large'), { status: 413 });
    return JSON.parse(raw.toString('utf8'));
  }
  if (typeof raw === 'string') {
    if (Buffer.byteLength(raw, 'utf8') > MAX_WEBHOOK_BODY_BYTES) throw Object.assign(new Error('Webhook body is too large'), { status: 413 });
    try {
      return JSON.parse(raw);
    } catch {
      throw Object.assign(new Error('Webhook body is not valid JSON'), { status: 400 });
    }
  }
  if (raw == null) throw Object.assign(new Error('Webhook body is required'), { status: 400 });
  throw Object.assign(new Error('Unsupported webhook body'), { status: 400 });
}

function validUpdateId(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

async function getBotProfile(forceRefresh = false) {
  if (forceRefresh) botProfilePromise = null;
  if (!botProfilePromise) {
    botProfilePromise = telegram('getMe').then((response) => response.result).catch((error) => {
      botProfilePromise = null;
      throw error;
    });
  }
  return botProfilePromise;
}

function botUsername(profile) {
  return profile?.username ? `@${profile.username}` : `@${DEFAULT_BOT_USERNAME}`;
}

function parseCommand(text, username) {
  const match = String(text ?? '').trim().match(/^\/(start|help|ping|admin)(?:@([A-Za-z0-9_]{5,32}))?(?:\s+.*)?$/i);
  if (!match) return null;
  if (match[2] && username && match[2].toLowerCase() !== username.toLowerCase()) return null;
  return match[1].toLowerCase();
}

function isAdminUser(userId) {
  return userId != null && ADMIN_IDS.has(String(userId));
}

function adminButton(label, data, style = 'primary') {
  return `<tg-button type="callback_data" style="${style}" data="${htmlEscape(data)}">${htmlEscape(label)}</tg-button>`;
}

function adminRows(rows) {
  return rows.map((row) => `<tg-button-row align="left">${row.join('')}</tg-button-row>`).join('\n');
}

function adminPanelHtml() {
  return [
    '<h2>🛠 Admin Control Center</h2>',
    '<p><b>TeleFQBot</b> internal diagnostics and knowledge-base controls.</p>',
    '<details><summary>Available sections</summary><p>View knowledge statistics, crawl state, indexed sources, Telegram webhook health, storage details and runtime information.</p></details>',
    '<hr/>',
    adminRows([
      [adminButton('📊 Statistics', 'adm:stats'), adminButton('🔄 Crawl', 'adm:crawl')],
      [adminButton('📚 Sources', 'adm:sources'), adminButton('🩺 Health', 'adm:health')],
      [adminButton('🗄 Storage', 'adm:storage'), adminButton('⚙️ System', 'adm:system')]
    ]),
    '<footer>Admin access is controlled by ADMIN_IDS.</footer>'
  ].join(' ');
}

function adminStatsHtml() {
  const state = loadCrawlState();
  const categories = new Map();
  for (const item of KNOWLEDGE) {
    const key = item.category || 'UNCATEGORIZED';
    categories.set(key, (categories.get(key) || 0) + 1);
  }
  const topCategories = [...categories.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  return [
    '<h2>📊 Knowledge Statistics</h2>',
    `<p><b>Total entries:</b> ${KNOWLEDGE.length}<br/><b>Indexed sources:</b> ${state?.totalSources ?? new Set(KNOWLEDGE.map((item) => item.source?.id).filter(Boolean)).size}<br/><b>Categories:</b> ${categories.size}<br/><b>Schema:</b> ${htmlEscape(state?.schemaVersion ?? 'unknown')}</p>`,
    '<details open><summary>Top categories</summary>',
    `<ul>${topCategories.map(([category, count]) => `<li>${htmlEscape(formatCategoryName(category))}: <b>${count}</b></li>`).join('')}</ul></details>`,
    '<hr/>',
    adminRows([[adminButton('↩️ Back', 'adm:home', 'link')]])
  ].join(' ');
}

function formatIndiaDateTime(value) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZoneName: 'short'
  }).format(date);
}

function formatHumanBytes(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value < 0) return '0 B';
  if (value < 1024) return `${value} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unit = -1;
  do {
    size /= 1024;
    unit += 1;
  } while (size >= 1024 && unit < units.length - 1);
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unit]}`;
}

function adminCrawlHtml() {
  const state = loadCrawlState();
  const sources = Object.entries(state?.sources ?? {}).sort((a, b) => b[1].items - a[1].items);
  return [
    '<h2>🔄 Crawl Status</h2>',
    `<p><b>Status:</b> ${htmlEscape(state?.status ?? 'unknown')}<br/><b>Generated:</b> ${htmlEscape(formatIndiaDateTime(state?.generatedAt))}<br/><b>Total entries:</b> ${state?.totalItems ?? KNOWLEDGE.length}<br/><b>Total sources:</b> ${state?.totalSources ?? sources.length}</p>`,
    '<details><summary>Source item counts</summary>',
    `<ul>${sources.map(([id, info]) => `<li><code>${htmlEscape(id)}</code> — ${Number(info?.items ?? 0)}</li>`).join('')}</ul></details>`,
    '<hr/>',
    adminRows([[adminButton('▶️ Run Crawl', 'adm:run-crawl', 'success'), adminButton('↩️ Back', 'adm:home', 'link')]])
  ].join(' ');
}

function adminCrawlStartedHtml(error = null) {
  if (error) return ['<h2>🔄 Crawl Control</h2>', `<p><b>❌ Unable to start crawl.</b><br/>${htmlEscape(error)}</p>`, '<footer>Configure the GitHub Actions token in Vercel before using manual crawl control.</footer>', adminRows([[adminButton('↩️ Back', 'adm:home', 'link'), adminButton('🔄 Try Again', 'adm:run-crawl')]])].join(' ');
  return ['<h2>🔄 Crawl Started</h2>', '<p>✅ The GitHub Actions crawl has been queued.</p>', '<p>You will receive a private notification when the crawl finishes, including whether the knowledge base changed.</p>', adminRows([[adminButton('🔄 Crawl Status', 'adm:crawl'), adminButton('↩️ Back', 'adm:home', 'link')]])].join(' ');
}

function adminSourcesHtml() {
  const state = loadCrawlState();
  const sources = Object.entries(state?.sources ?? {}).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  return [
    '<h2>📚 Indexed Sources</h2>',
    `<p><b>${sources.length}</b> indexed official sources are currently represented in the crawl state.</p>`,
    `<table bordered striped compact><tr><th>Source</th><th>Items</th></tr>${sources.map(([id, info]) => `<tr><td><code>${htmlEscape(id)}</code></td><td>${Number(info?.items ?? 0)}</td></tr>`).join('')}</table>`,
    '<hr/>',
    adminRows([[adminButton('↩️ Back', 'adm:home', 'link')]])
  ].join(' ');
}

async function adminHealthHtml() {
  let webhook = null;
  let webhookError = null;
  try {
    webhook = (await telegram('getWebhookInfo')).result;
  } catch (error) {
    webhookError = error?.description || error?.message || 'Unable to query Telegram webhook';
  }
  const state = loadCrawlState();
  const knowledgeHealthy = KNOWLEDGE.length > 0;
  const crawlHealthy = state?.status === 'success' && Number(state?.totalItems ?? 0) > 0;
  const webhookHealthy = Boolean(webhook && !webhookError);
  return [
    '<h2>🩺 System Health</h2>',
    `<p><b>Knowledge:</b> ${knowledgeHealthy ? '🟢 Healthy' : '🔴 Empty'}<br/><b>Crawl:</b> ${crawlHealthy ? '🟢 Healthy' : '🔴 Check crawl state'}<br/><b>Telegram API:</b> ${webhookHealthy ? '🟢 Reachable' : '🔴 Unavailable'}</p>`,
    '<details><summary>Webhook</summary>',
    webhookHealthy
      ? `<p><b>Pending updates:</b> ${Number(webhook.pending_update_count ?? 0)}<br/><b>Last error:</b> ${htmlEscape(webhook.last_error_message ?? 'None')}<br/><b>Max connections:</b> ${Number(webhook.max_connections ?? 0) || 'default'}</p>`
      : `<p>${htmlEscape(webhookError ?? 'Webhook information unavailable.')}</p>`,
    '</details>',
    '<footer>Health checks are read-only and do not modify Telegram configuration.</footer>',
    adminRows([[adminButton('↩️ Back', 'adm:home', 'link')]])
  ].join(' ');
}

function adminStorageHtml() {
  const knowledgeBytes = (() => { try { return fs.statSync(KNOWLEDGE_PATH).size; } catch { return 0; } })();
  const stateBytes = (() => { try { return fs.statSync(CRAWL_STATE_PATH).size; } catch { return 0; } })();
  const state = loadCrawlState();
  return [
    '<h2>🗄 Knowledge Storage</h2>',
    '<p>This bot has no external database. The production knowledge store is the generated GitHub dataset deployed with the serverless function.</p>',
    `<table bordered striped compact><tr><th>Store</th><th>Size</th></tr><tr><td><code>knowledge.json</code></td><td>${formatHumanBytes(knowledgeBytes)}</td></tr><tr><td><code>crawl-state.json</code></td><td>${formatHumanBytes(stateBytes)}</td></tr></table>`,
    `<p><b>Entries loaded:</b> ${KNOWLEDGE.length}<br/><b>Last generated:</b> ${htmlEscape(formatIndiaDateTime(state?.generatedAt))}</p>`,
    '<hr/>',
    adminRows([[adminButton('↩️ Back', 'adm:home', 'link')]])
  ].join(' ');
}

async function adminSystemHtml(profile = null) {
  const resolvedProfile = profile ?? await getBotProfile();
  return [
    '<h2>⚙️ Runtime Information</h2>',
    `<p><b>Bot:</b> ${htmlEscape(botUsername(resolvedProfile))}<br/><b>Node:</b> ${htmlEscape(process.version)}<br/><b>Runtime:</b> ${process.env.VERCEL === '1' ? 'Vercel' : 'Serverless/Node'}<br/><b>Knowledge schema:</b> ${htmlEscape(loadCrawlState()?.schemaVersion ?? 'unknown')}<br/><b>Admin IDs configured:</b> ${ADMIN_IDS.size}</p>`,
    '<footer>Runtime information is read-only.</footer>',
    adminRows([[adminButton('↩️ Back', 'adm:home', 'link')]])
  ].join(' ');
}

async function renderAdminPage(page, profile = null) {
  if (page === 'stats') return adminStatsHtml();
  if (page === 'crawl') return adminCrawlHtml();
  if (page === 'sources') return adminSourcesHtml();
  if (page === 'health') return adminHealthHtml();
  if (page === 'storage') return adminStorageHtml();
  if (page === 'system') return adminSystemHtml(profile);
  return adminPanelHtml();
}

async function editAdminMessage(callbackQuery, page, profile = null) {
  const message = callbackQuery.message;
  if (!message?.chat?.id || !message.message_id) throw new Error('Admin callback message is unavailable');
  const html = await renderAdminPage(page, profile);
  await telegram('editMessageText', {
    chat_id: message.chat.id,
    message_id: message.message_id,
    rich_message: { html: fitRichMessage(html, plainTextFromHtml(html)) }
  });
}

async function handleAdminCallback(update) {
  const callback = update.callback_query;
  if (!callback?.id) return;
  if (!isAdminUser(callback.from?.id)) { await answerCallbackQuerySafe(callback.id, { text: 'Not authorized.', show_alert: true }); return; }
  const data = String(callback.data ?? '');
  const page = data === 'adm:home' ? 'home' : data.startsWith('adm:') ? data.slice(4) : null;
  if (!page || !['home', 'stats', 'crawl', 'run-crawl', 'sources', 'health', 'storage', 'system'].includes(page)) { await answerCallbackQuerySafe(callback.id); return; }
  await answerCallbackQuerySafe(callback.id);
  if (page === 'run-crawl') {
    try { await triggerCrawlWorkflow(); await telegram('editMessageText', { chat_id: callback.message.chat.id, message_id: callback.message.message_id, rich_message: { html: adminCrawlStartedHtml() } }); }
    catch (error) { await telegram('editMessageText', { chat_id: callback.message.chat.id, message_id: callback.message.message_id, rich_message: { html: adminCrawlStartedHtml(error?.message ?? 'Unknown error') } }); }
    return;
  }
  const profile = page === 'system' ? await getBotProfile() : null;
  await editAdminMessage(callback, page, profile);
}

function startMessageHtml(username) {
  const cleanUsername = username.replace(/^@/, '');
  return [
    '<h1>👋 Welcome!</h1>',
    `<p><b>${htmlEscape(username)}</b> is an official Telegram knowledge search bot.</p>`,
    '<p>Search questions about Telegram, bots, Bot API features and official bot terms. Answers come only from the official Telegram sources indexed by this bot.</p>',
    '<details><summary>How to search</summary><ol><li>Tap <b>Search Telegram</b>.</li><li>Type a short, specific question.</li><li>Select the most relevant official answer.</li></ol></details>',
    '<tg-button-row align="left"><tg-button type="switch_inline_query_current_chat" style="primary" query="">🔎 Search Telegram</tg-button></tg-button-row>',
    '<tg-button-row align="left"><tg-button type="url" style="success" url="https://core.telegram.org/bots/api">📘 Bot API</tg-button><tg-button type="url" style="primary" url="https://www.telegram.org/faq">📚 Telegram FAQ</tg-button></tg-button-row>',
    `<footer>Inline usage: <code>@${htmlEscape(cleanUsername)} your question</code></footer>`
  ].join(' ');
}

function helpMessageHtml(username) {
  const cleanUsername = username.replace(/^@/, '');
  return [
    '<h2>🛠 Help & Commands</h2>',
    '<p>Use these commands or search the official Telegram knowledge base in inline mode.</p>',
    '<details open><summary>Commands</summary><ul><li><code>/start</code> — Open the welcome screen.</li><li><code>/help</code> — Show this help menu.</li><li><code>/ping</code> — Check bot response time.</li></ul></details>',
    '<details><summary>Inline search</summary><p>Type <code>@' + htmlEscape(cleanUsername) + ' your question</code> in any chat.</p><p>Examples:</p><ul><li><code>How do I create a bot?</code></li><li><code>What is inline mode?</code></li><li><code>How do webhooks work?</code></li></ul></details>',
    '<tg-button-row align="left"><tg-button type="switch_inline_query_current_chat" style="primary" query="">🔎 Search Telegram</tg-button></tg-button-row>',
    '<tg-button-row align="left"><tg-button type="url" style="success" url="https://core.telegram.org/bots/api">📘 Bot API</tg-button><tg-button type="url" style="primary" url="https://www.telegram.org/faq">📚 Telegram FAQ</tg-button></tg-button-row>',
    '<footer>Answers are based on official Telegram documentation.</footer>'
  ].join(' ');
}

function pingMessageHtml(latencyMs) {
  return [
    '<h2>🏓 Pong!</h2>',
    `<p><b>Response time:</b> ${latencyMs} ms</p>`,
    '<footer>Telegram Bot API round-trip latency</footer>'
  ].join(' ');
}

async function handleMessage(update, profile) {
  const message = update.message;
  if (!message?.chat?.id) return;

  const command = parseCommand(message.text, profile?.username);
  if (!command) return;

  if (command === 'admin') {
    if (!isAdminUser(message.from?.id)) return;
    await telegram('sendRichMessage', {
      chat_id: message.chat.id,
      rich_message: { html: adminPanelHtml() },
      disable_notification: true
    });
    return;
  }

  const username = botUsername(profile);
  let html;

  if (command === 'start') {
    html = startMessageHtml(username);
  } else if (command === 'help') {
    html = helpMessageHtml(username);
  } else {
    const pingStartedAt = performance.now();
    await telegram('getMe');
    const latencyMs = Math.max(1, Math.round(performance.now() - pingStartedAt));
    html = pingMessageHtml(latencyMs);
  }

  await telegram('sendRichMessage', {
    chat_id: message.chat.id,
    rich_message: { html: fitRichMessage(html, html) },
    disable_notification: false
  });
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(200).json({ ok: true });
    return;
  }

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && request.headers['x-telegram-bot-api-secret-token'] !== secret) {
    response.status(401).json({ ok: false });
    return;
  }

  try {
    const update = parseWebhookBody(request);
    if (!update || typeof update !== 'object') throw Object.assign(new Error('Invalid Telegram update'), { status: 400 });
    if (!validUpdateId(update.update_id)) throw Object.assign(new Error('Invalid Telegram update_id'), { status: 400 });

    await processUpdateOnce(update.update_id, async () => {
      if (update.callback_query) {
        await handleAdminCallback(update);
        return;
      }

      if (update.inline_query) {
        const queryId = update.inline_query.id;
        const query = update.inline_query.query ?? '';
        const offset = update.inline_query.offset ?? '';
        try {
          const page = inlineResults(query, offset);
          await telegram('answerInlineQuery', {
            inline_query_id: queryId,
            results: page.results,
            cache_time: INLINE_CACHE_TIME,
            is_personal: true,
            next_offset: page.next_offset
          });
        } catch (error) {
          if (!isExpiredInlineQueryError(error)) throw error;
        }
      } else if (update.message) {
        const profile = await getBotProfile();
        await handleMessage(update, profile);
      }
    });

    response.status(200).json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    response.status(error?.status && error.status >= 400 && error.status < 500 ? error.status : 500).json({ ok: false });
  }
}
