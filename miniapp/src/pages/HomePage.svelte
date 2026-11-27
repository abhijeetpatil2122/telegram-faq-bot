<script lang="ts">
  import type { Category } from '../lib/types'
  import CategoryList from '../components/CategoryList.svelte'
  import Icon from '../components/Icon.svelte'
  import SearchField from '../components/SearchField.svelte'

  let {
    categories,
    total,
    searchValue = $bindable(''),
    hasTelegramSession,
    onSearch,
    onCategory,
    onLibrary,
  }: {
    categories: Category[]
    total: number
    searchValue?: string
    hasTelegramSession: boolean
    onSearch: (query: string) => void
    onCategory: (category: Category) => void
    onLibrary: () => void
  } = $props()

  const suggestions = ['Telegram Premium', 'Privacy settings', 'Telegram Stars', 'Mini Apps']
</script>

<section class="hero">
  <p class="eyebrow">TELEGRAM HELP DESK</p>
  <h1>Find the answer.<br /><span>Keep moving.</span></h1>
  <p class="hero-copy">Clear answers from official Telegram sources, all in one place.</p>
</section>

<section class="search-area" aria-label="Search Telegram help">
  <SearchField bind:value={searchValue} onSearch={onSearch} />
  <div class="suggestions" aria-label="Popular searches">
    {#each suggestions as suggestion (suggestion)}
      <button type="button" onclick={() => onSearch(suggestion)}>{suggestion}</button>
    {/each}
  </div>
</section>

{#if !hasTelegramSession}
  <aside class="telegram-notice" aria-label="Telegram sign-in notice">
    <span class="notice-mark"><Icon name="help" size={17} /></span>
    <p><strong>Open in Telegram to search</strong><small>Search and share answers securely from the bot.</small></p>
    <a href="https://t.me/TeleFQBot" target="_blank" rel="noopener noreferrer">Open bot</a>
  </aside>
{/if}

<section class="topics-section" aria-labelledby="topics-heading">
  <div class="section-heading">
    <div><p class="eyebrow">OFFICIAL KNOWLEDGE</p><h2 id="topics-heading">Browse topics</h2></div>
    <button class="text-action" type="button" onclick={onLibrary}>All topics <span aria-hidden="true">›</span></button>
  </div>
  <CategoryList categories={categories.slice(0, 5)} onSelect={onCategory} />
  <p class="index-note"><span class="online-dot" aria-hidden="true"></span><strong>{total.toLocaleString()}</strong> answers indexed from official sources</p>
</section>
