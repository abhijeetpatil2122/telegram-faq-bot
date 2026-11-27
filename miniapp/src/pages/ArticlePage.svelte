<script lang="ts">
  import type { FAQItem } from '../lib/types'
  import Icon from '../components/Icon.svelte'

  let {
    item,
    safeAnswer,
    sharing,
    onShare,
    onCopy,
  }: {
    item: FAQItem
    safeAnswer: string
    sharing: boolean
    onShare: () => void
    onCopy: () => void
  } = $props()

  const sourceHref = $derived.by(() => {
    try {
      const url = new URL(item.source?.url || 'https://telegram.org/faq')
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : 'https://telegram.org/faq'
    } catch {
      return 'https://telegram.org/faq'
    }
  })
</script>

<article class="article-page">
  <div class="article-meta"><span>{item.category.replaceAll('_', ' ').toLowerCase()}</span><span class="source-check" aria-label="Official source">✓</span></div>
  <h1>{item.question || item.title}</h1>
  {#if item.section && item.section !== item.title}<p class="article-section">{item.section}</p>{/if}
  <!-- safeAnswer is rebuilt with a strict tag and URL allowlist before rendering. -->
  <div class="rich-content">{@html safeAnswer}</div>
  <a class="source-row" href={sourceHref} target="_blank" rel="noopener noreferrer">
    <span class="source-mark"><Icon name="help" size={17} /></span>
    <span class="source-copy"><small>ORIGINAL SOURCE</small><strong>{item.source?.title || 'Official Telegram source'}</strong></span>
    <span aria-hidden="true" class="row-chevron">↗</span>
  </a>
  <div class="article-actions">
    <button class="primary-action" type="button" disabled={sharing} onclick={onShare}><Icon name="share" size={17} />{sharing ? 'Preparing…' : 'Share answer'}</button>
    <button class="secondary-action" type="button" onclick={onCopy}><Icon name="copy" size={17} />Copy</button>
  </div>
  <p class="share-note">Share the answer and its source to any Telegram chat.</p>
</article>
