import Script from 'next/script'
import PublicHeader from '@/components/navigation/PublicHeader'
import { PublicFooter } from '@/app/components/PublicFooter'

const pricingStyles = `
.pricing-page {
  color: hsl(var(--foreground, 0 0% 8%));
  background: hsl(var(--background, 38 30% 97.5%));
  overflow-x: hidden;
}

.pricing-content {
  isolation: isolate;
  overflow-x: hidden;
}

.pricing-wrap {
  width: min(100%, 1160px);
  margin-inline: auto;
  padding-inline: clamp(1rem, 2.4vw, 1.5rem);
}

.pricing-section {
  padding-block: clamp(3rem, 6vw, 5.5rem);
  border-top: 1px solid hsl(var(--border, 220 10% 86%) / 0.5);
}

.pricing-section--hero {
  text-align: center;
  padding-top: clamp(1.2rem, 2.2vw, 2rem);
  padding-bottom: clamp(1.2rem, 2.2vw, 2rem);
  border-top: 0;
}

.pricing-section h1,
.pricing-section h2,
.pricing-section h3,
.pricing-section p,
.pricing-section li,
.pricing-section button,
.pricing-section input,
.pricing-section textarea,
.pricing-section select {
  letter-spacing: normal;
}

.pricing-section h1 {
  font-size: clamp(2rem, 5vw, 3.35rem);
  line-height: 1.1;
  font-weight: 700;
  color: hsl(var(--foreground, 0 0% 8%));
}

.pricing-section h2 {
  font-size: clamp(1.75rem, 3.4vw, 2.45rem);
  line-height: 1.2;
  font-weight: 700;
  color: hsl(var(--foreground, 0 0% 8%));
}

.pricing-section h3 {
  font-size: clamp(1.18rem, 2.2vw, 1.35rem);
  line-height: 1.3;
  font-weight: 600;
  color: hsl(var(--foreground, 0 0% 8%));
}

.pricing-band {
  width: 100vw;
  margin-left: calc(-50vw + 50%);
  margin-right: calc(-50vw + 50%);
}

.pricing-band--cream {
  background: color-mix(in hsl, hsl(var(--background, 38 30% 97.5%)) 98%, hsl(var(--secondary, 220 14% 96%)) 2%);
}

.pricing-band--white {
  background: hsl(var(--card, 0 0% 100%));
}

.pricing-eyebrow {
  color: hsl(var(--muted-foreground, 0 0% 45%));
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.74rem;
  font-weight: 700;
}

.pricing-currency-toggle {
  margin-top: 0.9rem;
  display: flex;
  justify-content: center;
  gap: 0.55rem;
  flex-wrap: wrap;
}

.pricing-currency-button {
  border: 0;
  border-radius: 999px;
  background: linear-gradient(to bottom, hsl(0 0% 100%), hsl(210 20% 96%));
  color: hsl(var(--foreground, 0 0% 8%));
  padding: 0.58rem 0.98rem;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  box-shadow: 0 4px 0 0 rgba(15, 23, 42, 0.18);
  transition: transform 180ms ease, filter 180ms ease, box-shadow 180ms ease;
}

.pricing-currency-flag {
  width: 1.1rem;
  height: 1.1rem;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-size: 0.95rem;
  line-height: 1;
  box-shadow: inset 0 0 0 1px hsl(var(--border, 220 10% 86%));
}

.pricing-currency-button:hover {
  box-shadow: 0 5px 0 0 rgba(15, 23, 42, 0.2);
  transform: translateY(-1px);
  filter: brightness(1.06);
}

.pricing-currency-button[aria-pressed="true"] {
  background: linear-gradient(to bottom, hsl(var(--primary, 38 92% 50%) / 0.86), hsl(var(--primary, 38 92% 50%) / 0.98));
  color: #ffffff;
  box-shadow: 0 4px 0 0 rgba(180, 83, 9, 0.95);
}

.pricing-currency-button[aria-pressed="true"]:hover {
  box-shadow: 0 5px 0 0 rgba(180, 83, 9, 0.95);
}

.pricing-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  align-items: start;
  margin-top: 2rem;
  max-width: 820px;
  margin-inline: auto;
}

.pricing-featured-col {
  position: relative;
  height: auto;
}

.pricing-card,
.pricing-box {
  border: 1px solid hsl(var(--border, 220 10% 86%));
  border-radius: 16px;
  background: hsl(var(--card, 0 0% 100%));
  box-shadow: 0 10px 30px -24px rgba(15, 23, 42, 0.34);
  padding: clamp(1rem, 2vw, 1.35rem);
}

.pricing-card {
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  min-height: 0;
  height: auto;
}

.pricing-card > header {
  padding-bottom: 0.75rem;
}

.pricing-card--featured {
  border-color: hsl(var(--primary, 38 92% 50%) / 0.35);
  background: hsl(var(--card, 0 0% 100%));
  box-shadow:
    0 0 0 1px hsl(var(--primary, 38 92% 50%) / 0.2),
    0 18px 36px -28px rgba(15, 23, 42, 0.35);
  overflow: hidden;
  transform: none;
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}

.pricing-featured-band {
  position: static;
  transform: none;
  margin-bottom: 0;
  z-index: 2;
  width: 100%;
  box-sizing: border-box;
  text-align: center;
  background: hsl(var(--primary, 38 92% 50%));
  color: #ffffff;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 0.62rem 0.75rem;
  border: 1px solid hsl(var(--primary, 38 92% 50%) / 0.35);
  border-bottom: 0;
  border-radius: 16px 16px 0 0;
}

.pricing-card--featured::before {
  display: none;
}

.pricing-tagline {
  color: hsl(var(--muted-foreground, 0 0% 45%));
  font-size: 0.94rem;
  line-height: 1.5;
  margin-top: 0.32rem;
}

.pricing-price {
  margin-top: 0.9rem;
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
}

.pricing-quote-block {
  margin-top: 0.9rem;
  border: 1px solid hsl(var(--border, 220 10% 86%));
  border-radius: 12px;
  background: hsl(var(--card, 0 0% 100%));
  padding: 0.75rem;
}

.pricing-quote-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: hsl(var(--foreground, 0 0% 8%));
}

.pricing-quote-copy {
  margin: 0.35rem 0 0.7rem 0;
  font-size: 0.85rem;
  line-height: 1.45;
  color: hsl(var(--muted-foreground, 0 0% 45%));
}

.pricing-price-value {
  font-size: clamp(1.9rem, 2.4vw, 2.25rem);
  font-weight: 700;
  line-height: 1.08;
}

.pricing-price-suffix {
  color: hsl(var(--muted-foreground, 0 0% 45%));
  font-size: 0.95rem;
}

.pricing-trust-note {
  margin-top: 0.65rem;
  margin-bottom: 0;
  font-size: 0.84rem;
  line-height: 1.45;
  color: hsl(var(--muted-foreground, 0 0% 45%));
}

.pricing-hours {
  margin-top: 0.95rem;
  width: fit-content;
  border-radius: 999px;
  border: 1px solid hsl(var(--border, 220 10% 86%));
  background: color-mix(in hsl, hsl(var(--card, 0 0% 100%)) 88%, hsl(var(--secondary, 220 14% 96%)) 12%);
  padding: 0.26rem 0.68rem;
  font-size: 0.72rem;
  color: hsl(var(--muted-foreground, 0 0% 45%));
}

.pricing-divider {
  margin-top: 0.8rem;
  margin-bottom: 1.05rem;
  border: none;
  border-top: 1px solid hsl(var(--border, 220 10% 86%));
}

.pricing-group-label {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: hsl(var(--muted-foreground, 0 0% 45%));
  font-size: 0.72rem;
  font-weight: 700;
}

.pricing-list {
  margin: 0.5rem 0 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.3rem;
}

.pricing-list li {
  font-size: 0.92rem;
  line-height: 1.42;
  display: flex;
  align-items: start;
  gap: 0.45rem;
}

.pricing-list li::before {
  content: "✓";
  color: hsl(152 67% 34%);
  font-weight: 700;
  line-height: 1.4;
}

.pricing-group + .pricing-group {
  margin-top: 1rem;
}

.pricing-card-footer {
  margin-top: 0.95rem;
  margin-bottom: 0.6rem;
  padding-top: 0;
}

.pricing-button {
  width: 100%;
  border-radius: 999px;
  border: 1px solid hsl(var(--border, 220 10% 86%));
  background: linear-gradient(to bottom, hsl(0 0% 100%), hsl(210 20% 96%));
  color: hsl(var(--foreground, 0 0% 8%));
  padding: 0.74rem 1rem;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
  transition: transform 180ms ease, border-color 180ms ease, box-shadow 180ms ease, filter 180ms ease;
  box-shadow: 0 4px 0 0 rgba(15, 23, 42, 0.18);
}

.pricing-button:hover {
  transform: translateY(-1px);
  background: linear-gradient(to bottom, hsl(var(--primary, 38 92% 50%) / 0.86), hsl(var(--primary, 38 92% 50%) / 0.98));
  color: #ffffff;
  border-color: hsl(var(--primary, 38 92% 50%) / 0.7);
  box-shadow: 0 5px 0 0 rgba(180, 83, 9, 0.95);
  filter: brightness(1.06);
}

.pricing-button--primary {
  background: linear-gradient(to bottom, hsl(var(--primary, 38 92% 50%) / 0.86), hsl(var(--primary, 38 92% 50%) / 0.98));
  color: #ffffff;
  box-shadow: 0 4px 0 0 rgba(180, 83, 9, 0.95);
}

.pricing-two-col,
.pricing-three-col {
  display: grid;
  gap: clamp(0.9rem, 1.8vw, 1.25rem);
}

.pricing-two-col {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.pricing-three-col {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.pricing-contact-wrap {
  max-width: 44rem;
  margin-inline: auto;
}

.pricing-contact-card {
  border: 1px solid hsl(var(--border, 220 10% 86%));
  border-radius: 14px;
  background: hsl(var(--card, 0 0% 100%));
  box-shadow: 0 8px 24px -20px rgba(15, 23, 42, 0.3);
  padding: clamp(1.1rem, 2vw, 1.7rem);
}

.pricing-contact-lines {
  margin-top: 0.9rem;
  display: grid;
  gap: 0.55rem;
}

.pricing-contact-line {
  font-size: 0.98rem;
  color: hsl(var(--foreground, 0 0% 8%));
}

.pricing-contact-label {
  font-weight: 700;
}

.pricing-form {
  display: grid;
  gap: 0.9rem;
}

.pricing-field,
.pricing-select,
.pricing-textarea {
  width: 100%;
  border: 1px solid hsl(var(--input, 220 10% 86%));
  border-radius: var(--radius, 0.5rem);
  background: hsl(var(--background, 38 30% 97.5%));
  color: inherit;
  padding: 0.7rem 0.85rem;
  font: inherit;
}

.pricing-thankyou {
  display: none;
  border: 1px solid hsl(var(--border, 220 10% 86%));
  border-radius: calc(var(--radius, 0.75rem) + 2px);
  background: color-mix(in hsl, hsl(var(--card, 0 0% 100%)) 76%, hsl(var(--primary, 38 92% 50%)) 24%);
  padding: 1rem 1.1rem;
}

.pricing-footer-note {
  text-align: center;
  color: hsl(var(--muted-foreground, 0 0% 45%));
  font-size: 0.95rem;
  max-width: 72ch;
  margin-inline: auto;
}

@media (max-width: 767px) {
  .pricing-grid,
  .pricing-two-col,
  .pricing-three-col {
    grid-template-columns: 1fr;
  }

  .pricing-tagline,
  .pricing-list li {
    font-size: 0.98rem;
  }

  .pricing-section--hero {
    padding-top: 2.2rem;
    padding-bottom: 2.6rem;
  }

  .pricing-card--featured {
    transform: none;
    overflow: hidden;
  }

  .pricing-grid {
    margin-top: 1.1rem;
  }
}

@page {
  size: A4;
  margin: 12mm;
}

@media print {
  .pricing-page,
  .pricing-content {
    background: #ffffff !important;
    color: #111111 !important;
    overflow: visible !important;
  }

  .pricing-content > header,
  .pricing-content > footer {
    display: none !important;
  }

  .pricing-band,
  .pricing-band--cream,
  .pricing-band--white {
    width: auto !important;
    margin: 0 !important;
    background: #ffffff !important;
  }

  .pricing-section {
    border-top: 0 !important;
    padding-block: 6mm !important;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .pricing-wrap {
    width: 100% !important;
    max-width: none !important;
    padding: 0 !important;
  }

  .pricing-currency-toggle,
  .pricing-trust-note,
  .pricing-card-footer,
  .pricing-button {
    display: none !important;
  }

  .pricing-grid {
    margin-top: 4mm !important;
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
    gap: 4mm !important;
    align-items: stretch !important;
  }

  .pricing-card,
  .pricing-box,
  .pricing-contact-card {
    box-shadow: none !important;
    border: 1px solid #d9d9d9 !important;
    background: #ffffff !important;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .pricing-featured-col {
    height: auto !important;
  }

  .pricing-featured-band,
  .pricing-popular-tag {
    position: static !important;
    transform: none !important;
    margin: 0 0 3mm 0 !important;
    border: 1px solid #d9d9d9 !important;
    border-radius: 8px !important;
    background: #f3f3f3 !important;
    color: #111111 !important;
    top: auto !important;
  }

  .pricing-card--featured {
    border-color: #d9d9d9 !important;
  }

  .pricing-eyebrow {
    color: #555555 !important;
  }

  .pricing-section h1 {
    font-size: 28pt !important;
    line-height: 1.1 !important;
    margin: 0 !important;
  }

  .pricing-section h2 {
    font-size: 18pt !important;
    margin: 0 0 3mm 0 !important;
  }

  .pricing-section h3 {
    font-size: 13pt !important;
  }

  .pricing-tagline,
  .pricing-list li,
  .pricing-price-suffix,
  .pricing-footer-note {
    color: #333333 !important;
  }

  .pricing-subtitle {
    margin-top: 2mm !important;
    max-width: none !important;
    font-size: 11pt !important;
    line-height: 1.45 !important;
  }

  .pricing-price-value {
    font-size: 26pt !important;
  }

  .pricing-hours {
    border: 1px solid #d9d9d9 !important;
    background: #ffffff !important;
    color: #555555 !important;
  }

  .pricing-divider {
    border-top: 1px solid #e5e5e5 !important;
    margin: 3mm 0 !important;
  }

  #contact {
    break-before: page;
    page-break-before: always;
  }
}
`

const pricingScript = `
(() => {
  const prices = {
    usd: {
      support: '$400',
      growth: '$1,000',
      partner: '$2,400',
      discovery: '$600',
      project: 'from $1,800'
    },
    gbp: {
      support: '£320',
      growth: '£780',
      partner: '£1,900',
      discovery: '£480',
      project: 'from £1,400'
    },
    inr: {
      support: '₹34,000',
      growth: '₹84,000',
      partner: '₹1,99,000',
      discovery: '₹50,000',
      project: 'from ₹1,50,000'
    }
  }

  const syncPrices = (currency) => {
    const selected = prices[currency] || prices.usd
    document.querySelectorAll('[data-price]').forEach((node) => {
      const key = node.getAttribute('data-price')
      if (key && selected[key]) node.textContent = selected[key]
    })

    document.querySelectorAll('[data-currency]').forEach((button) => {
      const active = button.getAttribute('data-currency') === currency
      button.setAttribute('aria-pressed', active ? 'true' : 'false')
    })
  }

  document.querySelectorAll('[data-currency]').forEach((button) => {
    button.addEventListener('click', () => {
      const currency = button.getAttribute('data-currency') || 'usd'
      syncPrices(currency)
    })
  })

  document.querySelectorAll('[data-scroll-contact]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = document.getElementById('contact')
      if (target) target.scrollIntoView({ behavior: 'smooth' })
    })
  })

  syncPrices('usd')
})()
`

export default function PricingPage() {
  return (
    <div className="pricing-page min-h-[100dvh]">
      <div className="pricing-content">
        <PublicHeader />
        <main>
            <style dangerouslySetInnerHTML={{ __html: pricingStyles }} />
            <section className="pricing-section pricing-section--hero pricing-band pricing-band--cream">
              <div className="pricing-wrap">
                <h1 className="font-semibold tracking-tight leading-tight text-3xl sm:text-5xl md:text-7xl">Plans that grow with you</h1>
                <p className="pricing-trust-note">No hidden fees. Cancel anytime.</p>
                <div className="pricing-currency-toggle" role="group" aria-label="Choose currency">
                  <button type="button" className="pricing-currency-button" data-currency="usd" aria-pressed="true"><span className="pricing-currency-flag" aria-hidden>🇺🇸</span><span>$ USD</span></button>
                  <button type="button" className="pricing-currency-button" data-currency="gbp" aria-pressed="false"><span className="pricing-currency-flag" aria-hidden>🇬🇧</span><span>£ GBP</span></button>
                  <button type="button" className="pricing-currency-button" data-currency="inr" aria-pressed="false"><span className="pricing-currency-flag" aria-hidden>🇮🇳</span><span>₹ INR</span></button>
                </div>
                <div className="pricing-grid" style={{ textAlign: 'left' }}>
                  <article className="pricing-card">
                    <header>
                      <h3>Support</h3>
                      <p className="pricing-tagline">Best for teams that need reliable technical guidance and ongoing support.</p>
                      <div className="pricing-quote-block">
                        <p className="pricing-quote-title">Get a custom quote</p>
                        <p className="pricing-quote-copy">Tell us your goals and timeline - we will share a tailored proposal within one business day.</p>
                        <button type="button" className="pricing-button" data-scroll-contact>Get support quote</button>
                      </div>
                      <p className="pricing-hours">Up to 32 hrs / month</p>
                    </header>
                    <hr className="pricing-divider" />
                    <section className="pricing-group"><p className="pricing-group-label">Advisory</p><ul className="pricing-list"><li>Senior guidance on software development</li><li>Roadmap to using AI tools</li><li>Tool and vendor recommendations</li></ul></section>
                    <section className="pricing-group"><p className="pricing-group-label">Integrations</p><ul className="pricing-list"><li>Fix issues in existing integrations</li><li>Keep CRM and automations reliable</li></ul></section>
                    <section className="pricing-group"><p className="pricing-group-label">Support</p><ul className="pricing-list"><li>24-hour email response</li><li>Weekly advisory call</li><li>Monthly progress report</li></ul></section>
                  </article>

                  <div className="pricing-featured-col">
                    <div className="pricing-featured-band">Most popular</div>
                    <article className="pricing-card pricing-card--featured">
                      <header>
                        <h3>Growth</h3>
                        <p className="pricing-tagline">Best for teams evolving existing systems and shipping new software faster.</p>
                        <div className="pricing-quote-block">
                          <p className="pricing-quote-title">Get a custom quote</p>
                          <p className="pricing-quote-copy">Tell us your goals and timeline - we will share a tailored proposal within one business day.</p>
                          <button type="button" className="pricing-button pricing-button--primary" data-scroll-contact>Get growth quote</button>
                        </div>
                        <p className="pricing-hours">Up to 80 hrs / month</p>
                      </header>
                      <hr className="pricing-divider" />
                      <section className="pricing-group"><p className="pricing-group-label">Development</p><ul className="pricing-list"><li>Custom software development</li><li>Deployment and regular maintenance</li><li>Mobile-responsive builds</li><li>MVP and prototype delivery</li></ul></section>
                      <section className="pricing-group"><p className="pricing-group-label">AI and automation</p><ul className="pricing-list"><li>AI tool integrations</li><li>CRM configuration and build</li><li>Zapier and Make automations</li><li>LLM-powered feature development</li></ul></section>
                      <section className="pricing-group"><p className="pricing-group-label">Integrations</p><ul className="pricing-list"><li>API integrations and builds</li><li>Third-party platform connections</li><li>Data pipeline setup</li></ul></section>
                      <section className="pricing-group"><p className="pricing-group-label">Support</p><ul className="pricing-list"><li>Dedicated project manager</li><li>Priority response within a few hours</li><li>Bi-weekly (twice a week) 1-hour strategy call</li><li>Monthly progress report</li></ul></section>
                    </article>
                  </div>

                  <article className="pricing-card">
                    <header>
                      <h3>Partner</h3>
                      <p className="pricing-tagline">Best for businesses needing a dedicated technical team with strategic ownership.</p>
                      <div className="pricing-quote-block">
                        <p className="pricing-quote-title">Get a custom quote</p>
                        <p className="pricing-quote-copy">Tell us your goals and timeline - we will share a tailored proposal within one business day.</p>
                        <button type="button" className="pricing-button" data-scroll-contact>Get partner quote</button>
                      </div>
                      <p className="pricing-hours">Up to 140 hrs / month</p>
                    </header>
                    <hr className="pricing-divider" />
                    <section className="pricing-group"><p className="pricing-group-label">Full-stack development</p><ul className="pricing-list"><li>Full product development</li><li>Roadmap planning and execution</li><li>Architecture and system design</li><li>Legacy system migration</li><li>Enterprise software builds</li><li>Custom ML and AI systems</li></ul></section>
                    <section className="pricing-group"><p className="pricing-group-label">AI and automation</p><ul className="pricing-list"><li>Custom AI agent development</li><li>Advanced automation pipelines</li><li>Multi-system AI integrations</li><li>Research and data scraping tools</li></ul></section>
                    <section className="pricing-group"><p className="pricing-group-label">Strategy</p><ul className="pricing-list"><li>Technical strategy and advisory</li><li>Vendor and tool selection</li><li>Third-party vendor management</li><li>GDPR and compliance guidance</li></ul></section>
                    <section className="pricing-group"><p className="pricing-group-label">Support</p><ul className="pricing-list"><li>Same-day priority response</li><li>Weekly strategy calls</li><li>Full documentation maintained</li><li>SLA available on request</li></ul></section>
                  </article>
                </div>
              </div>
            </section>

            <section className="pricing-section pricing-band pricing-band--cream">
              <div className="pricing-wrap" style={{ textAlign: 'center' }}>
                <p className="pricing-eyebrow">One-off projects</p>
                <h2>Not ready for a monthly plan?</h2>
                <p className="pricing-subtitle">Start with a scoped one-off engagement. Every client relationship begins with a paid discovery audit so we understand exactly what needs building before we commit to a price.</p>
                <div className="pricing-two-col" style={{ marginTop: '1rem', textAlign: 'left' }}>
                  <article className="pricing-box">
                    <h3>Discovery audit</h3>
                    <p className="pricing-price-value" data-price="discovery">$600</p>
                    <p className="pricing-tagline">We audit your existing codebase or brief, document what exists, and deliver a written scope before any build begins.</p>
                  </article>
                  <article className="pricing-box">
                    <h3>Project build</h3>
                    <p className="pricing-price-value" data-price="project">from $1,800</p>
                    <p className="pricing-tagline">Fixed-price delivery for a defined scope. Typical projects include CRM builds, AI integrations, custom automations and web applications.</p>
                  </article>
                </div>
              </div>
            </section>

            <section className="pricing-section pricing-band pricing-band--white">
              <div className="pricing-wrap pricing-three-col">
                <article className="pricing-box">
                  <h3>Built for real businesses</h3>
                  <p className="pricing-tagline">We work with founders and SMEs who need genuine technical expertise without the overhead of hiring in-house. No juniors, no outsourced filler work.</p>
                </article>
                <article className="pricing-box">
                  <h3>Fast, transparent delivery</h3>
                  <p className="pricing-tagline">Fixed prices agreed before work begins. You always know what you are getting, what it costs, and when it will be done.</p>
                </article>
                <article className="pricing-box">
                  <h3>Global team, local accountability</h3>
                  <p className="pricing-tagline">We operate across the US, UK and India. Wherever you are, you have a dedicated point of contact who is responsible for your project end to end.</p>
                </article>
              </div>
            </section>

            <section id="contact" className="pricing-section pricing-band pricing-band--cream">
              <div className="pricing-wrap pricing-contact-wrap">
                <div className="pricing-contact-card">
                  <p className="pricing-eyebrow">Contact details</p>
                  <h2>Ready to get started?</h2>
                  <p className="pricing-tagline">Reach out directly and our team will respond within one business day.</p>
                  <div className="pricing-contact-lines">
                    <p className="pricing-contact-line"><span className="pricing-contact-label">Email:</span> hello@starships.ai</p>
                    <p className="pricing-contact-line"><span className="pricing-contact-label">Website:</span> www.starships.ai</p>
                    <p className="pricing-contact-line"><span className="pricing-contact-label">US:</span> +1 (555) 010-2400</p>
                    <p className="pricing-contact-line"><span className="pricing-contact-label">UK:</span> +44 20 0000 2400</p>
                    <p className="pricing-contact-line"><span className="pricing-contact-label">India:</span> +91 80 0000 2400</p>
                  </div>
                </div>
              </div>
            </section>

            <section className="pricing-section pricing-band pricing-band--cream" style={{ paddingTop: 0 }}>
              <div className="pricing-wrap">
              </div>
            </section>
        </main>
        <PublicFooter fromPath="/pricing" showTopDivider={false} />
      </div>
      <Script id="pricing-page-script" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: pricingScript }} />
    </div>
  )
}
