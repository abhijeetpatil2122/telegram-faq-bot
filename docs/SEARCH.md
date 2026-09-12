# Search

The live bot continues to use deterministic scoring in `api/telegram.js`.

The knowledge upgrade adds fields without replacing that search contract:

```text
query
  ↓
normalization
  ↓
question/title exactness
  ↓
aliases + keywords
  ↓
section/category/source priority
  ↓
confidence threshold
  ↓
Rich Message result + official source
```

Future search work should remain deterministic unless a separate optional semantic-search layer is introduced. An LLM must never become the authority for an answer.
