import fs from 'node:fs';

const file = 'api/telegram.js';
let source = fs.readFileSync(file, 'utf8');

if (!source.includes("const SOURCES_CONFIG_PATH = path.join(process.cwd(), 'config', 'sources.json');")) {
  source = source.replace(
    "const CRAWL_STATE_PATH = path.join(process.cwd(), 'data', 'crawl-state.json');",
    "const CRAWL_STATE_PATH = path.join(process.cwd(), 'data', 'crawl-state.json');\nconst SOURCES_CONFIG_PATH = path.join(process.cwd(), 'config', 'sources.json');",
    1
  );
}

if (!source.includes('function loadSourceConfig()')) {
  const marker = 'const KNOWLEDGE = loadKnowledge();';
  const helper = [
    'function loadSourceConfig() {',
    '  try {',
    "    const data = JSON.parse(fs.readFileSync(SOURCES_CONFIG_PATH, 'utf8'));",
    '    return Array.isArray(data.sources) ? data.sources : [];',
    '  } catch (error) {',
    "    console.error('Unable to load source configuration:', error);",
    '    return [];',
    '  }',
    '}',
    ''
  ].join('\n');
  source = source.replace(marker, helper + marker, 1);
}

if (!source.includes('function sourceDiagnosticStatus(')) {
  const pattern = /function adminSourcesHtml\(\) \{[\s\S]*?\n\}\n\nasync function adminHealthHtml/;
  const replacement = [
    'function sourceDiagnosticStatus(source, info, state, now) {',
    "  if (!info) return { label: '🔴 Missing', kind: 'missing', diagnosis: 'No successful crawl record exists for this indexed source.' };",
    '  const items = Number(info.items ?? 0);',
    "  if (!items) return { label: '🔴 Empty', kind: 'empty', diagnosis: 'The source has no indexed entries.' };",
    "  if (!info.hash) return { label: '🟡 Incomplete', kind: 'incomplete', diagnosis: 'Entries exist but the source hash is missing.' };",
    '  const generatedAt = new Date(state?.generatedAt ?? 0);',
    '  const ageMs = Number.isNaN(generatedAt.getTime()) ? Number.POSITIVE_INFINITY : Math.max(0, now - generatedAt.getTime());',
    "  if (ageMs > 12 * 60 * 60 * 1000) return { label: '🟡 Stale', kind: 'stale', diagnosis: 'The last successful crawl is older than 12 hours.' };",
    "  return { label: '🟢 Healthy', kind: 'healthy', diagnosis: 'Indexed entries, source hash and recent crawl state are present.' };",
    '}',
    '',
    'function adminSourcesHtml() {',
    '  const state = loadCrawlState();',
    '  const configured = loadSourceConfig().filter((source) => source.enabled && source.index);',
    '  const stateSources = state?.sources ?? {};',
    '  const now = Date.now();',
    '  const diagnostics = configured.map((source) => {',
    '    const info = stateSources[source.id];',
    '    return { source, info, diagnostic: sourceDiagnosticStatus(source, info, state, now) };',
    '  });',
    "  const healthy = diagnostics.filter((entry) => entry.diagnostic.kind === 'healthy').length;",
    "  const warnings = diagnostics.filter((entry) => ['stale', 'incomplete'].includes(entry.diagnostic.kind)).length;",
    "  const failures = diagnostics.filter((entry) => ['missing', 'empty'].includes(entry.diagnostic.kind)).length;",
    '  const rows = diagnostics.map(({ source, info, diagnostic }) => {',
    '    const items = Number(info?.items ?? 0);',
    '    const generated = formatIndiaDateTime(state?.generatedAt);',
    "    return '<tr><td><b>' + htmlEscape(source.title) + '</b><br/><code>' + htmlEscape(source.id) + '</code></td><td>' + diagnostic.label + '</td><td>' + items + '</td><td>' + htmlEscape(formatCategoryName(source.category)) + '</td><td>' + htmlEscape(generated) + '</td></tr>';",
    "  }).join('');",
    '  const diagnosis = failures > 0',
    "    ? '<p><b>Diagnosis:</b> ' + failures + ' source' + (failures === 1 ? '' : 's') + ' missing or empty. Investigate the next crawl before treating the knowledge base as fully healthy.</p>'",
    "    : warnings > 0 ? '<p><b>Diagnosis:</b> ' + warnings + ' source' + (warnings === 1 ? '' : 's') + ' need attention for staleness or incomplete crawl metadata.</p>'",
    "      : '<p><b>Diagnosis:</b> All indexed sources are healthy and represented in the latest successful crawl.</p>';",
    '  return [',
    "    '<h2>📚 Source Diagnostics</h2>',",
    "    '<p><b>🟢 Healthy:</b> ' + healthy + ' &nbsp; <b>🟡 Attention:</b> ' + warnings + ' &nbsp; <b>🔴 Failures:</b> ' + failures + '<br/><b>Indexed:</b> ' + configured.length + ' &nbsp; <b>Last crawl:</b> ' + htmlEscape(formatIndiaDateTime(state?.generatedAt)) + '</p>',",
    '    diagnosis,',
    "    '<table bordered striped compact><tr><th>Source</th><th>Status</th><th>Items</th><th>Category</th><th>Last crawl</th></tr>',",
    "    rows || '<tr><td colspan=\"5\">No indexed sources are configured.</td></tr>',",
    "    '</table>',",
    "    '<details><summary>Diagnostic rules</summary><ul><li>🟢 Healthy — entries, source hash and a crawl within 12 hours.</li><li>🟡 Attention — stale or incomplete crawl metadata.</li><li>🔴 Failure — missing or empty source data in the latest successful state.</li></ul></details>',",
    "    '<footer>Source diagnostics are read-only. A failed crawl does not replace the last successful knowledge dataset.</footer>',",
    "    adminRows([[adminButton('↩️ Back', 'adm:home', 'link')]])",
    "  ].join(' ');",
    '}',
    '',
    'async function adminHealthHtml'
  ].join('\n');

  if (!pattern.test(source)) throw new Error('adminSourcesHtml block not found');
  source = source.replace(pattern, replacement, 1);
}

fs.writeFileSync(file, source);
console.log('Source diagnostics patch applied.');
