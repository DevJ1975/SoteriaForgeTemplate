const SITE_URL = 'https://soteria-forge-lms.vercel.app'

function upsertMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector(selector) as HTMLMetaElement | HTMLLinkElement | null
  if (!element) {
    element = selector.startsWith('link') ? document.createElement('link') : document.createElement('meta')
    document.head.appendChild(element)
  }

  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, value)
  }
}

export function setSeo(input: {
  title: string
  description: string
  path?: string
  image?: string
  noindex?: boolean
  structuredData?: Record<string, unknown>
}) {
  const url = `${SITE_URL}${input.path ?? window.location.pathname}`
  const image = input.image ?? `${SITE_URL}/logos/og-card.png`

  document.title = input.title
  upsertMeta('meta[name="description"]', { name: 'description', content: input.description })
  upsertMeta('meta[name="robots"]', {
    name: 'robots',
    content: input.noindex ? 'noindex,nofollow' : 'index,follow',
  })
  upsertMeta('link[rel="canonical"]', { rel: 'canonical', href: url })
  upsertMeta('meta[property="og:title"]', { property: 'og:title', content: input.title })
  upsertMeta('meta[property="og:description"]', { property: 'og:description', content: input.description })
  upsertMeta('meta[property="og:url"]', { property: 'og:url', content: url })
  upsertMeta('meta[property="og:image"]', { property: 'og:image', content: image })
  upsertMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' })

  document.querySelector('#soteria-structured-data')?.remove()
  if (input.structuredData) {
    const script = document.createElement('script')
    script.id = 'soteria-structured-data'
    script.type = 'application/ld+json'
    script.textContent = JSON.stringify(input.structuredData)
    document.head.appendChild(script)
  }
}

export function noindexAppShell(title: string) {
  setSeo({
    title,
    description: 'Secure Soteria FORGE learning workspace.',
    noindex: true,
  })
}
