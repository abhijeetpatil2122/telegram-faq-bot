# Rich Messages

> **Telegram presentation layer**  
> Maintained by **Abhijeet Patil** — `@Religiouskid` · `@Para0x`

Rich Messages are the presentation foundation of the Help Desk. The crawler preserves supported Telegram formatting instead of flattening source answers into plain text.

## ◇ Supported structures

Current renderer goals include:

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

## ⟡ Rendering boundary

```text
Official source content
        ↓
   crawler sanitization
        ↓
 canonical answer_html
        ↓
 api/telegram.js
        ↓
 Rich Message wrapper
        ↓
      Telegram
```

`config/rich-message.json` documents the supported renderer contract.

Keep **source content** and **Telegram presentation** conceptually separate: the crawler produces canonical Rich HTML, while `api/telegram.js` decides how that content is wrapped for inline results and source controls.

## 🛡 Safety principle

Generated HTML is validated before publication. Unsupported or unsafe markup should never become part of the published knowledge dataset.
