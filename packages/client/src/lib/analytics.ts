export type AnalyticsEvent =
  | { type: 'hero_cta_clicked' }
  | { type: 'demo_started'; scenario: 'enrichment' | 'copilot' }
  | { type: 'demo_completed'; scenario: 'enrichment' | 'copilot' }
  | { type: 'use_case_toggled'; scenario: 'enrichment' | 'copilot' }
  | { type: 'discord_hero_clicked' }
  | { type: 'discord_cta_clicked' }
  | { type: 'public_header_logo_clicked'; fromPath: string }
  | { type: 'public_header_nav_clicked'; fromPath: string; destination: '/' | '/marketplace' | '/login'; variant: 'desktop' | 'mobile' }
  | { type: 'public_header_mobile_menu_toggled'; fromPath: string; isOpen: boolean }
  | { type: 'public_footer_link_clicked'; fromPath: string; destination: '/privacy' | '/terms' | '/docs' | 'https://theingenuity.co' }
  | { type: 'marketplace_category_selected'; category: string }
  | { type: 'marketplace_search_used'; query: string }
  | { type: 'marketplace_agent_template_opened'; templateId: string; templateName: string; category?: string }
  | { type: 'marketplace_agent_deploy_clicked'; templateId: string; templateName: string; category?: string; authenticated: boolean }
  | { type: 'auth_tab_changed'; tab: 'login' | 'register' }
  | { type: 'auth_oauth_clicked'; provider: 'google' | 'github' }
  | { type: 'auth_login_submitted' }
  | { type: 'auth_register_submitted' }
  | { type: 'auth_forgot_password_clicked' }
  | { type: 'auth_resend_verification_clicked' }
  | { type: 'auth_terms_clicked' }
  | { type: 'auth_privacy_clicked' }
  | { type: 'forgot_password_submitted' }
  | { type: 'forgot_password_success_shown' }
  | { type: 'forgot_password_send_another_clicked' }
  | { type: 'reset_password_submitted' }
  | { type: 'reset_password_invalid_token_shown' }
  | { type: 'reset_password_request_new_link_clicked' }

let posthogImportPromise: Promise<typeof import('posthog-js')> | null = null

export function track(event: AnalyticsEvent) {
  try {
    if (typeof window === 'undefined') return

    ;(window as any).dataLayer = (window as any).dataLayer || []
    ;(window as any).dataLayer.push({ event: event.type, ...event })

    // PostHog Product Analytics: mirror the same event name + properties.
    // Note: safe even if PostHog isn't configured (it will no-op / queue until init).
    const { type, ...props } = event
    // Lazy import to avoid pulling posthog-js into server bundles.
    posthogImportPromise ??= import('posthog-js')
    posthogImportPromise
      .then(mod => mod.default.capture(type, props))
      .catch(() => {
        // no-op
      })
  } catch (_) {
    // no-op
  }
}
