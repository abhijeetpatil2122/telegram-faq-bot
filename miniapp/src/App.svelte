<script lang="ts">
  import { onMount } from 'svelte'
  import BottomNav from './components/BottomNav.svelte'
  import Icon from './components/Icon.svelte'
  import ArticlePage from './pages/ArticlePage.svelte'
  import HomePage from './pages/HomePage.svelte'
  import LibraryPage from './pages/LibraryPage.svelte'
  import ProfilePage from './pages/ProfilePage.svelte'
  import ResultsPage from './pages/ResultsPage.svelte'
  import { loadBootstrap, plainAnswer, prepareShare, searchFAQs } from './lib/api'
  import { sanitizeAnswer } from './lib/sanitize'
  import { applyTelegramTheme, haptic, syncTelegramInsets, telegramApp } from './lib/telegram'
  import type { AppView, Category, FAQItem, TelegramUser } from './lib/types'

  interface HistoryEntry {
    view: AppView
    scrollY: number
  }

  let view = $state<AppView>('home')
  let history = $state<HistoryEntry[]>([])
  let categories = $state<Category[]>([])
  let total = $state(0)
  let version = $state('—')
  let activeQuery = $state('')
  let activeCategory = $state<Category | null>(null)
  let searchValue = $state('')
  let results = $state<FAQItem[]>([])
  let currentItem = $state<FAQItem | null>(null)
  let safeAnswer = $state('')
  let loading = $state(false)
  let sharing = $state(false)
  let resultError = $state('')
  let toastMessage = $state('')
  let user = $state<TelegramUser | undefined>(undefined)
  let requestNumber = 0
  let toastTimer: ReturnType<typeof setTimeout>

  const hasTelegramSession = $derived(Boolean(telegramApp()?.initData))

  function showToast(message: string): void {
    toastMessage = message
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => (toastMessage = ''), 2400)
  }

  function navigate(next: AppView): void {
    if (next === view) return
    history = [...history, { view, scrollY: window.scrollY }]
    view = next
    window.scrollTo({ top: 0, behavior: 'auto' })
    haptic()
  }

  function goBack(): void {
    const previous = history.at(-1)
    if (!previous) return
    history = history.slice(0, -1)
    view = previous.view
    requestAnimationFrame(() => window.scrollTo({ top: previous.scrollY, behavior: 'auto' }))
    haptic()
  }

  function selectTab(next: AppView): void {
    history = []
    view = next
    if (next === 'profile') haptic()
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  async function runSearch(query: string, category: Category | null = null): Promise<void> {
    const normalized = query.trim()
    activeQuery = normalized
    activeCategory = category
    searchValue = normalized
    resultError = ''
    results = []
    loading = true
    const currentRequest = ++requestNumber
    navigate('results')
    try {
      const response = await searchFAQs(telegramApp()?.initData ?? '', normalized, category?.id ?? null)
      if (currentRequest === requestNumber) results = response.results
    } catch (error) {
      if (currentRequest === requestNumber) {
        const message = error instanceof Error ? error.message : 'Search is temporarily unavailable.'
        resultError = hasTelegramSession ? message : 'Open this Mini App in Telegram to search official answers.'
      }
    } finally {
      if (currentRequest === requestNumber) loading = false
    }
  }

  function openCategory(category: Category): void {
    void runSearch('', category)
  }

  function openArticle(item: FAQItem): void {
    currentItem = item
    const markup = item.answer_html || `<p>${escapeText(item.answer || 'No answer text is available.')}</p>`
    safeAnswer = sanitizeAnswer(markup)
    navigate('detail')
  }

  function escapeText(value: string): string {
    return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  }

  function openExternalLink(url: string): void {
    let safeUrl: URL
    try {
      safeUrl = new URL(url)
      if (safeUrl.protocol !== 'https:' && safeUrl.protocol !== 'http:') return
    } catch {
      return
    }
    const app = telegramApp()
    const open = () => {
      if (/^https:\/\/(t\.me|telegram\.me|telegram\.dog)(\/|$)/i.test(safeUrl.href) && app?.openTelegramLink) {
        app.openTelegramLink(safeUrl.href)
      } else if (app?.openLink) {
        app.openLink(safeUrl.href, { try_instant_view: true })
      } else {
        window.open(safeUrl.href, '_blank', 'noopener,noreferrer')
      }
    }
    if (app?.showPopup) {
      app.showPopup({
        title: 'Open this link?',
        message: safeUrl.href.slice(0, 220),
        buttons: [{ id: 'open', text: 'Open link' }, { id: 'cancel', type: 'cancel', text: 'Cancel' }],
      }, (id) => id === 'open' && open())
    } else {
      open()
    }
  }

  function handleWindowClick(event: MouseEvent): void {
    if (!(event.target instanceof Element)) return
    const link = event.target.closest<HTMLAnchorElement>('a[data-external-link]')
    if (!link) return
    event.preventDefault()
    openExternalLink(link.href)
  }

  async function copyCurrentAnswer(): Promise<void> {
    if (!currentItem) return
    try {
      await navigator.clipboard.writeText(plainAnswer(currentItem))
      showToast('Answer copied')
      haptic()
    } catch {
      showToast('Copy is not available in this Telegram client')
    }
  }

  function fallbackInlineShare(): void {
    if (!currentItem) return
    const query = String(currentItem.question || currentItem.title).trim().slice(0, 240)
    const app = telegramApp()
    if (app?.switchInlineQuery) {
      app.switchInlineQuery(query, ['users', 'bots', 'groups', 'channels'])
      return
    }
    const source = currentItem.source?.url || 'https://telegram.org/faq'
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(source)}&text=${encodeURIComponent(query)}`
    app?.openTelegramLink?.(shareUrl)
  }

  async function shareCurrentAnswer(): Promise<void> {
    if (!currentItem || sharing) return
    const app = telegramApp()
    if (!app?.shareMessage || !app.isVersionAtLeast?.('8.0')) {
      fallbackInlineShare()
      return
    }
    sharing = true
    try {
      const prepared = await prepareShare(app.initData, String(currentItem.id))
      if (!prepared.prepared_message_id) throw new Error('Telegram did not return a prepared message.')
      app.shareMessage(prepared.prepared_message_id)
      haptic()
    } catch {
      showToast('Opening inline sharing instead')
      fallbackInlineShare()
    } finally {
      sharing = false
    }
  }

  function handleShareFailed(payload?: unknown): void {
    const reason = (payload as { error?: string } | undefined)?.error
    if (reason === 'UNSUPPORTED' || reason === 'MESSAGE_EXPIRED') {
      showToast('Opening inline sharing instead')
      fallbackInlineShare()
    } else if (reason === 'USER_DECLINED') {
      showToast('Sharing cancelled')
    } else {
      showToast('Telegram could not share this answer')
    }
  }

  $effect(() => {
    const backButton = telegramApp()?.BackButton
    if (view !== 'home' || history.length > 0) backButton?.show()
    else backButton?.hide()
  })

  onMount(() => {
    const app = telegramApp()
    const onThemeChange = () => applyTelegramTheme()
    const onViewportChange = () => syncTelegramInsets()
    const onShareSent = () => showToast('Answer shared')
    const onShareFailed = (payload?: unknown) => handleShareFailed(payload)

    app?.ready()
    app?.expand()
    try {
      if (app?.isVersionAtLeast?.('8.0') && app.requestFullscreen && !app.isFullscreen) app.requestFullscreen()
    } catch {
      // The app remains usable when fullscreen is unsupported or declined.
    }
    applyTelegramTheme()
    syncTelegramInsets()
    user = app?.initDataUnsafe?.user
    app?.BackButton?.onClick(goBack)
    app?.onEvent?.('themeChanged', onThemeChange)
    app?.onEvent?.('viewportChanged', onViewportChange)
    app?.onEvent?.('safeAreaChanged', onViewportChange)
    app?.onEvent?.('contentSafeAreaChanged', onViewportChange)
    app?.onEvent?.('shareMessageSent', onShareSent)
    app?.onEvent?.('shareMessageFailed', onShareFailed)

    void loadBootstrap().then((data) => {
      categories = data.categories
      total = data.total
      version = data.version
    }).catch(() => showToast('The knowledge index could not be loaded'))

    return () => {
      app?.BackButton?.offClick?.(goBack)
      app?.offEvent?.('themeChanged', onThemeChange)
      app?.offEvent?.('viewportChanged', onViewportChange)
      app?.offEvent?.('safeAreaChanged', onViewportChange)
      app?.offEvent?.('contentSafeAreaChanged', onViewportChange)
      app?.offEvent?.('shareMessageSent', onShareSent)
      app?.offEvent?.('shareMessageFailed', onShareFailed)
      clearTimeout(toastTimer)
    }
  })
</script>

<svelte:window onclick={handleWindowClick} />

<div class="app-frame" class:detail-view={view === 'detail'}>
  <header class="app-header">
    <a class="brand" href="https://t.me/TeleFQBot" target="_blank" rel="noopener noreferrer" aria-label="TeleFQBot on Telegram">
      <span class="brand-mark"><img src="../telegram.svg" alt="" /></span>
      <span>Help Desk</span>
    </a>
    <span class="official-label"><span aria-hidden="true"></span>Official</span>
    {#if user}
      <button class="header-avatar" type="button" aria-label="Open profile" onclick={() => selectTab('profile')}>
        {#if user.photo_url?.startsWith('https://')}<img src={user.photo_url} alt="" referrerpolicy="no-referrer" />{:else}{user.first_name.slice(0, 1).toUpperCase()}{/if}
      </button>
    {/if}
  </header>

  <main class="page-content">
    {#if view === 'home'}
      <HomePage {categories} {total} bind:searchValue {hasTelegramSession} onSearch={(query) => void runSearch(query)} onCategory={openCategory} onLibrary={() => navigate('library')} />
    {:else if view === 'library'}
      <LibraryPage {categories} onCategory={openCategory} />
    {:else if view === 'results'}
      <ResultsPage query={activeQuery} category={activeCategory?.title ?? null} items={results} {loading} error={resultError} onSelect={openArticle} />
    {:else if view === 'detail' && currentItem}
      <ArticlePage item={currentItem} {safeAnswer} {sharing} onShare={() => void shareCurrentAnswer()} onCopy={() => void copyCurrentAnswer()} />
    {:else if view === 'profile'}
      <ProfilePage {user} {version} {total} />
    {/if}
  </main>

  {#if view !== 'detail'}
    <BottomNav active={view} onNavigate={selectTab} />
  {/if}
  {#if toastMessage}<div class="toast" role="status" aria-live="polite">{toastMessage}</div>{/if}
</div>
