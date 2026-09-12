# Rich Messages

The existing Rich Message implementation remains the presentation foundation.

The crawler preserves supported Telegram formatting rather than flattening answers to plain text. Current renderer goals include:

- headings
- paragraphs
- ordered and unordered lists
- code and preformatted blocks
- tables
- blockquotes
- collapsible details
- links
- source buttons
- URL buttons

`config/rich-message.json` documents the renderer contract. Keep source content and Telegram presentation separate: the crawler produces canonical Rich HTML, while `api/telegram.js` decides how to wrap it into inline results and source controls.
