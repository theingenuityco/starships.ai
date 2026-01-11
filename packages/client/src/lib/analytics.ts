export type AnalyticsEvent =
  | { type: 'hero_cta_clicked' }
  | { type: 'demo_started'; scenario: 'enrichment' | 'copilot' }
  | { type: 'demo_completed'; scenario: 'enrichment' | 'copilot' }
  | { type: 'use_case_toggled'; scenario: 'enrichment' | 'copilot' }
  | { type: 'discord_hero_clicked' }
  | { type: 'discord_cta_clicked' }

export function track(event: AnalyticsEvent) {
  try {
    if (typeof window === 'undefined') return

    ;(window as any).dataLayer = (window as any).dataLayer || []
    ;(window as any).dataLayer.push({ event: event.type, ...event })

    // PostHog Product Analytics: mirror the same event name + properties.
    // Note: safe even if PostHog isn't configured (it will no-op / queue until init).
    const { type, ...props } = event
    // Lazy import to avoid pulling posthog-js into server bundles.
    import('posthog-js')
      .then(mod => mod.default.capture(type, props))
      .catch(() => {
        // no-op
      })
  } catch (_) {
    // no-op
  }
}
