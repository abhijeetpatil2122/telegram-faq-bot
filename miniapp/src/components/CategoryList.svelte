<script lang="ts">
  import type { Category } from '../lib/types'
  import Icon from './Icon.svelte'

  let { categories, onSelect }: { categories: Category[]; onSelect: (category: Category) => void } = $props()

  function categoryIcon(id: string): string {
    if (id.includes('PRIVACY') || id.includes('SECURITY')) return 'lock'
    if (id.includes('PREMIUM') || id.includes('STARS')) return 'star'
    if (id.includes('ACCOUNT')) return 'user'
    return 'help'
  }
</script>

<div class="category-list">
  {#each categories as category (category.id)}
    <button class="category-row" type="button" onclick={() => onSelect(category)}>
      <span class="category-icon"><Icon name={categoryIcon(category.id)} size={19} /></span>
      <span class="category-copy"><strong>{category.title}</strong><small>{category.description || `${category.count} answers`}</small></span>
      <span class="row-count">{category.count}</span>
      <span class="row-chevron" aria-hidden="true">›</span>
    </button>
  {/each}
  {#if categories.length === 0}
    <p class="empty-state">Topics will appear here when the knowledge index is available.</p>
  {/if}
</div>
