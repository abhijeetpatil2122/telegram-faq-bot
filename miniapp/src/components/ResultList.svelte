<script lang="ts">
  import type { FAQItem } from '../lib/types'

  let {
    items,
    loading = false,
    error = '',
    onSelect,
  }: { items: FAQItem[]; loading?: boolean; error?: string; onSelect: (item: FAQItem) => void } = $props()
</script>

<div class="results-list" aria-live="polite" aria-busy={loading}>
  {#if loading}
    <div class="result-placeholder" aria-hidden="true"></div>
    <div class="result-placeholder" aria-hidden="true"></div>
    <div class="result-placeholder" aria-hidden="true"></div>
  {:else if error}
    <p class="empty-state">{error}</p>
  {:else if items.length === 0}
    <p class="empty-state">No matching answer was found. Try another phrase or topic.</p>
  {:else}
    {#each items as item (item.id)}
      <button class="result-row" type="button" onclick={() => onSelect(item)}>
        <span class="result-copy">
          <strong>{item.question || item.title}</strong>
          <small>{item.category.replaceAll('_', ' ').toLowerCase()} <span aria-hidden="true">·</span> {item.source?.title || 'Official Telegram source'}</small>
        </span>
        <span class="row-chevron" aria-hidden="true">›</span>
      </button>
    {/each}
  {/if}
</div>
