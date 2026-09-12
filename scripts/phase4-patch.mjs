import fs from 'node:fs';

const file = 'api/telegram.js';
let source = fs.readFileSync(file, 'utf8');

if (!source.includes("from '../scripts/search-engine.mjs'")) {
  source = source.replace(
    "import { createHash } from 'node:crypto';",
    "import { createHash } from 'node:crypto';\nimport { searchKnowledge as retrieveKnowledge } from '../scripts/search-engine.mjs';"
  );
}

source = source.replace(
  /const SEARCH_STOPWORDS = new Set\([\s\S]*?\nfunction searchKnowledge\(query\) \{[\s\S]*?\n\}\n\nfunction paginate/,
  'function paginate'
);

source = source.replace(
  'const allMatches = searchKnowledge(query);',
  'const allMatches = retrieveKnowledge(KNOWLEDGE, query, { minScore: MIN_SCORE });'
);

source = source.replace(
  /function promoteExternalLinks\(html\) \{[\s\S]*?\n\}\n\nfunction renderAnswerHtml/,
  `function promoteExternalLinks(html) {\n  const sourceHtml = String(html ?? '');\n  const tableParts = sourceHtml.split(/(<table\\b[\\s\\S]*?<\\/table>)/gi);\n  return tableParts.map((part) => {\n    if (/^<table\\b/i.test(part)) return part;\n    return part.replace(/<a\\b([^>]*?)\\bhref=["']([^"']+)["']([^>]*)>([\\s\\S]*?)<\\/a>/gi, (match, before, href, after, labelHtml) => {\n      const label = String(labelHtml).replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').trim();\n      const button = richUrlButton(label, href, 'primary');\n      return button ?? match;\n    });\n  }).join('');\n}\n\nfunction renderAnswerHtml`
);

source = source.replace(
  /function sourceFooter\(item\) \{[\s\S]*?\n\}\n\nfunction niceDescription/,
  `function sourceFooter(item) {\n  const sourceTitle = item.source?.title ?? 'Official Telegram source';\n  const sourceUrl = safeButtonUrl(item.source?.url);\n  return sourceUrl\n    ? \`<footer>Source: <a href="\${htmlEscape(sourceUrl)}">\${htmlEscape(sourceTitle)}</a></footer>\`\n    : \`<footer>Source: \${htmlEscape(sourceTitle)}</footer>\`;\n}\n\nfunction niceDescription`
);

source = source.replace(
  /function niceDescription\(item\) \{[\s\S]*?\n\}\n\nfunction renderRichAnswer/,
  `function niceDescription(item) {\n  const source = item.source?.title ?? 'Official Telegram source';\n  const section = item.section && item.section !== item.title ? \` • \${item.section}\` : '';\n  const category = item.category ? \` • \${item.category}\` : '';\n  return \`\${source}\${section}\${category} • Official documentation\`.slice(0, 255);\n}\n\nfunction renderRichAnswer`
);

source = source.replace(
  /function renderRichAnswer\(item\) \{[\s\S]*?\n\}\n\nfunction noResultsContent/,
  `function renderRichAnswer(item) {\n  const title = item.question ?? item.title ?? 'Telegram documentation';\n  const category = item.category ? \`<p><b>Category:</b> \${htmlEscape(item.category)}</p>\` : '';\n  const sourceUrl = safeButtonUrl(item.source?.url);\n  const sourceTitle = item.source?.title ?? 'Official Telegram source';\n  const sourceButton = sourceUrl ? richUrlButton(\`Open \${sourceTitle}\`, sourceUrl, 'primary') : null;\n  return [\n    \`<h2>❓ \${htmlEscape(title)}</h2>\`,\n    category,\n    \`<details open><summary>Answer</summary>\${renderAnswerHtml(item)}</details>\`,\n    '<hr/>',\n    sourceFooter(item),\n    sourceButton ? \`<tg-button-row align="left">\${sourceButton}</tg-button-row>\` : ''\n  ].filter(Boolean).join('\\n');\n}\n\nfunction noResultsContent`
);

fs.writeFileSync(file, source);
console.log('Phase 4 API patch applied.');
