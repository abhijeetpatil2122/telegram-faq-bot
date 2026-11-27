<script lang="ts">
  import type { AppView } from '../lib/types'
  import Icon from './Icon.svelte'

  let { active, onNavigate }: { active: AppView; onNavigate: (view: AppView) => void } = $props()
  const tabs: { id: AppView; label: string; icon: string }[] = [
    { id: 'home', label: 'Home', icon: 'home' },
    { id: 'library', label: 'Topics', icon: 'grid' },
    { id: 'profile', label: 'Profile', icon: 'user' },
  ]
</script>

<nav class="bottom-nav" aria-label="Main navigation">
  {#each tabs as tab (tab.id)}
    <button class:active={active === tab.id} type="button" aria-current={active === tab.id ? 'page' : undefined} onclick={() => onNavigate(tab.id)}>
      <Icon name={tab.icon} size={21} />
      <span>{tab.label}</span>
    </button>
  {/each}
</nav>
