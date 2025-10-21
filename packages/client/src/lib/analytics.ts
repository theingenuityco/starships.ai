export type AnalyticsEvent =
  | { type: 'hero_cta_clicked' }
  | { type: 'demo_started'; scenario: 'enrichment' | 'copilot' }
  | { type: 'demo_completed'; scenario: 'enrichment' | 'copilot' }
  | { type: 'use_case_toggled'; scenario: 'enrichment' | 'copilot' }

export function track(event: AnalyticsEvent) {
  try {
    ;(window as any).dataLayer = (window as any).dataLayer || []
    ;(window as any).dataLayer.push({ event: event.type, ...event })
  } catch (_) {
    // no-op
  }
}
