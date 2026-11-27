<script lang="ts">
  import Icon from '../components/Icon.svelte'
  import type { TelegramUser } from '../lib/types'

  let { user, version, total }: { user?: TelegramUser; version: string; total: number } = $props()
  const displayName = $derived([user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || 'Telegram user')
  const language = $derived.by(() => {
    if (!user?.language_code) return 'Not provided'
    try {
      return new Intl.DisplayNames([user.language_code], { type: 'language' }).of(user.language_code) || user.language_code
    } catch {
      return user.language_code
    }
  })
</script>

<section class="page-heading"><p class="eyebrow">YOUR MINI APP</p><h1>Profile</h1></section>
<div class="profile-intro">
  <span class="profile-avatar">
    {#if user?.photo_url?.startsWith('https://')}<img src={user.photo_url} alt="Telegram profile" referrerpolicy="no-referrer" />{:else}{displayName.slice(0, 1).toUpperCase()}{/if}
  </span>
  <div><h2>{displayName}</h2><p>{user?.username ? `@${user.username}` : 'Telegram profile'}</p></div>
</div>
<div class="verified-row"><span class="verified-check">✓</span><span><strong>Official knowledge</strong><small>Answers link back to their source</small></span><span class="verified-label">VERIFIED</span></div>
<section class="profile-details" aria-label="About the Mini App">
  <h2>About</h2>
  <div class="profile-row"><span class="profile-symbol">Aa</span><span><small>LANGUAGE</small><strong>{language}</strong></span></div>
  <div class="profile-row"><span class="profile-symbol">#</span><span><small>KNOWLEDGE BASE</small><strong>{total.toLocaleString()} indexed entries</strong></span></div>
  <div class="profile-row"><span class="profile-symbol">v</span><span><small>APP VERSION</small><strong>{version || '—'}</strong></span></div>
  <a class="profile-row profile-bot-link" href="https://t.me/TeleFQBot" target="_blank" rel="noopener noreferrer"><span class="profile-symbol"><Icon name="share" size={16} /></span><span><small>YOUR BOT</small><strong>TeleFQBot · @TeleFQBot</strong></span><span class="row-chevron" aria-hidden="true">↗</span></a>
</section>
<p class="profile-note">Your Telegram profile stays on this device and is never used to personalize FAQ search.</p>
