<script lang="ts">
  import Icon from './Icon.svelte'

  let {
    value = $bindable(''),
    placeholder = 'Search Telegram help',
    onSearch,
  }: { value?: string; placeholder?: string; onSearch: (query: string) => void } = $props()

  function submit(event: SubmitEvent): void {
    event.preventDefault()
    onSearch(value.trim())
  }
</script>

<form class="search-field" role="search" onsubmit={submit}>
  <Icon name="search" size={19} />
  <label class="sr-only" for="faq-search">Search Telegram help</label>
  <input id="faq-search" bind:value placeholder={placeholder} type="search" autocomplete="off" />
  {#if value}
    <button class="clear-search" type="button" aria-label="Clear search" onclick={() => (value = '')}>×</button>
  {/if}
  <button class="search-submit" type="submit" aria-label="Search help"><Icon name="search" size={17} /></button>
</form>
