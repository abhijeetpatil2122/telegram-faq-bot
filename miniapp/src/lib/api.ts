import type { BootstrapResponse, FAQItem, SearchResponse } from './types'

async function request<T>(method: 'GET' | 'POST', body?: Record<string, string>): Promise<T> {
  const response = await fetch('/api/miniapp', {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await response.json().catch(() => ({})) as { ok?: boolean; error?: string }
  if (!response.ok || !data.ok) throw new Error(data.error || 'The Help Desk request failed.')
  return data as T
}

export function loadBootstrap(): Promise<BootstrapResponse> {
  return request<BootstrapResponse>('GET')
}

export function searchFAQs(initData: string, query: string, category: string | null): Promise<SearchResponse> {
  return request<SearchResponse>('POST', { initData, query, category: category ?? '' })
}

export function prepareShare(initData: string, itemId: string): Promise<{ prepared_message_id: string }> {
  return request<{ prepared_message_id: string }>('POST', {
    initData,
    action: 'prepare-share',
    itemId,
  })
}

export function plainAnswer(item: FAQItem): string {
  const parser = new DOMParser()
  const body = parser.parseFromString(item.answer_html || item.answer, 'text/html').body
  return [item.question || item.title, body.textContent || item.answer, item.source?.title, item.source?.url]
    .filter(Boolean)
    .join('\n\n')
}
