<script lang="ts">
  import type { FAQItem } from '../lib/types'
  import ResultList from '../components/ResultList.svelte'

  let {
    query,
    category,
    items,
    loading,
    error,
    onSelect,
  }: {
    query: string
    category: string | null
    items: FAQItem[]
    loading: boolean
    error: string
    onSelect: (item: FAQItem) => void
  } = $props()
</script>

<section class="page-heading results-heading">
  <p class="eyebrow">{category ? 'TOPIC LIBRARY' : 'OFFICIAL KNOWLEDGE'}</p>
  <h1>{category || (query ? 'Search results' : 'Browse answers')}</h1>
  {#if query && !category}<p>Results for <strong>“{query}”</strong></p>{/if}
</section>
<ResultList {items} {loading} {error} {onSelect} />
