export type HeadlineVariant = 'A' | 'B' | 'C'
export type CtaVariant = 'A' | 'B'

const HEADLINE_KEY = 'exp_h'
const CTA_KEY = 'exp_cta'

function readParam(name: string): string | null {
  if (typeof window === 'undefined') return null
  const url = new URL(window.location.href)
  return url.searchParams.get(name)
}

function persist(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {}
}

function readPersisted(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function getHeadlineVariant(): HeadlineVariant {
  const param = (readParam('h') || readPersisted(HEADLINE_KEY)) as HeadlineVariant | null
  const value: HeadlineVariant = param === 'B' || param === 'C' ? param : 'A'
  persist(HEADLINE_KEY, value)
  return value
}

export function getCtaVariant(): CtaVariant {
  const param = (readParam('cta') || readPersisted(CTA_KEY)) as CtaVariant | null
  const value: CtaVariant = param === 'B' ? 'B' : 'A'
  persist(CTA_KEY, value)
  return value
}
