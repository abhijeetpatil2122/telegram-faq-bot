const ALLOWED = new Set([
  'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'DEL', 'CODE', 'PRE', 'BLOCKQUOTE',
  'UL', 'OL', 'LI', 'H1', 'H2', 'H3', 'H4', 'HR', 'A', 'DETAILS', 'SUMMARY',
  'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'FOOTER', 'SUB', 'SUP',
])

export function sanitizeAnswer(markup: string): string {
  const document = new DOMParser().parseFromString(markup, 'text/html')

  function sanitize(parent: ParentNode): void {
    for (const child of [...parent.childNodes]) {
      if (!(child instanceof Element)) {
        if (child.nodeType !== Node.TEXT_NODE) child.remove()
        continue
      }
      const originalHref = child.tagName === 'A' ? child.getAttribute('href') : null
      sanitize(child)
      if (!ALLOWED.has(child.tagName)) {
        child.replaceWith(...child.childNodes)
        continue
      }
      for (const attribute of [...child.attributes]) child.removeAttribute(attribute.name)
      if (child.tagName === 'A') {
        if (originalHref) {
          try {
            const url = new URL(originalHref, window.location.origin)
            if (url.protocol === 'https:' || url.protocol === 'http:') {
              child.setAttribute('href', url.href)
              child.setAttribute('target', '_blank')
              child.setAttribute('rel', 'noopener noreferrer')
              child.setAttribute('data-external-link', 'true')
            }
          } catch {
            // Invalid source URLs are displayed as text and never made clickable.
          }
        }
      }
    }
  }

  sanitize(document.body)
  return document.body.innerHTML
}
