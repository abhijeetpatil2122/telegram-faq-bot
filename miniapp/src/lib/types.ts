export type AppView = 'home' | 'library' | 'results' | 'profile' | 'detail'

export interface Category {
  id: string
  title: string
  description: string
  count: number
}

export interface FAQSource {
  title: string
  url: string
}

export interface FAQItem {
  id: string
  type: string
  category: string
  question: string
  title: string
  section: string
  answer: string
  answer_html: string
  source: FAQSource
}

export interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  language_code?: string
}

export interface BootstrapResponse {
  ok: true
  bot: string
  version: string
  total: number
  categories: Category[]
}

export interface SearchResponse {
  ok: true
  query: string
  category: string | null
  count: number
  results: FAQItem[]
}
