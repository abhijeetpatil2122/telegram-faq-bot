import type { TelegramUser } from './types'

interface TelegramBackButton {
  show(): void
  hide(): void
  onClick(callback: () => void): void
  offClick?(callback: () => void): void
}

interface TelegramThemeParams {
  bg_color?: string
  secondary_bg_color?: string
  bottom_bar_bg_color?: string
}

interface TelegramWebApp {
  initData: string
  initDataUnsafe?: { user?: TelegramUser }
  colorScheme?: 'light' | 'dark'
  isFullscreen?: boolean
  themeParams?: TelegramThemeParams
  BackButton?: TelegramBackButton
  HapticFeedback?: { impactOccurred(style: 'light' | 'medium' | 'heavy'): void }
  ready(): void
  expand(): void
  isVersionAtLeast?(version: string): boolean
  requestFullscreen?(): void
  setHeaderColor?(color: string): void
  setBackgroundColor?(color: string): void
  setBottomBarColor?(color: string): void
  onEvent?(event: string, callback: (payload?: unknown) => void): void
  offEvent?(event: string, callback: (payload?: unknown) => void): void
  openLink?(url: string, options?: { try_instant_view?: boolean }): void
  openTelegramLink?(url: string): void
  showPopup?(params: { title?: string; message: string; buttons?: { id?: string; type?: string; text?: string }[] }, callback?: (id: string) => void): void
  switchInlineQuery?(query: string, chatTypes?: string[]): void
  shareMessage?(preparedMessageId: string): void
  showAlert?(message: string, callback?: () => void): void
  readTextFromClipboard?(callback: (result: { value?: string }) => void): void
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp }
  }
}

export function telegramApp(): TelegramWebApp | undefined {
  return window.Telegram?.WebApp
}

export function haptic(): void {
  try {
    telegramApp()?.HapticFeedback?.impactOccurred('light')
  } catch {
    // Haptics are optional and can be unavailable in older Telegram clients.
  }
}

export function applyTelegramTheme(): void {
  const app = telegramApp()
  const scheme = app?.colorScheme ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  document.documentElement.dataset.theme = scheme
  document.documentElement.style.colorScheme = scheme
  const color = app?.themeParams?.bg_color
  if (color && /^#[\da-f]{6}$/i.test(color)) {
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', color)
  }
  try {
    app?.setHeaderColor?.('bg_color')
    app?.setBackgroundColor?.('bg_color')
    if (app?.isVersionAtLeast?.('7.10')) app.setBottomBarColor?.('secondary_bg_color')
  } catch {
    // Older Telegram builds may not implement all appearance methods.
  }
}

export function syncTelegramInsets(): void {
  const app = telegramApp() as (TelegramWebApp & {
    safeAreaInset?: Record<string, number>
    contentSafeAreaInset?: Record<string, number>
    viewportStableHeight?: number
    viewportHeight?: number
  }) | undefined
  if (!app) return
  for (const [prefix, values] of [
    ['safe', app.safeAreaInset],
    ['content-safe', app.contentSafeAreaInset],
  ] as const) {
    for (const [side, value] of Object.entries(values ?? {})) {
      if (Number.isFinite(value)) {
        document.documentElement.style.setProperty(`--${prefix}-${side}-live`, `${Math.max(0, value)}px`)
      }
    }
  }
  const height = app.viewportStableHeight ?? app.viewportHeight
  if (Number.isFinite(height) && height! > 0) {
    document.documentElement.style.setProperty('--app-viewport-height', `${height}px`)
  }
}
