# Search

> **Deterministic relevance engine**  
> Maintained by **Abhijeet Patil** — `@Religiouskid` · `@Para0x`

The live bot uses deterministic scoring. Search operates over the generated knowledge dataset and never asks an LLM to become the authority for an answer.

## ◇ Ranking flow

```text
query
  ↓
normalization
  ↓
phrase + alias expansion
  ↓
question/title matching
  ↓
aliases + keywords
  ↓
section/category/source relevance
  ↓
audience + priority signals
  ↓
confidence safeguards
  ↓
Rich Message result + official source
```

## ⟡ Indexed signals

The engine considers signals including:

- exact question/title matches
- phrase aliases
- indexed aliases and keywords
- section relevance
- category relevance
- source priority
- user/developer audience intent
- token coverage
- controlled typo/fuzzy matching
- coherent multi-word matching
- confidence thresholds

## 🛡 No-result rule

A search result is shown only when it clears the configured relevance threshold. If official indexed material cannot support the query, the Help Desk should return **no official result** rather than guessing.

## ◌ Design constraint

The knowledge upgrade enriches the search index without replacing the deterministic search contract. Any future semantic-search layer should remain optional and must not turn an LLM into the source of truth.
