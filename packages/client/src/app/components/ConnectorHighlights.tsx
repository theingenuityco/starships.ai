'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'

const CONNECTOR_ICONS = [
  '/connectors/activecampaign.svg',
  '/connectors/ahrefs.svg',
  '/connectors/airtable.svg',
  '/connectors/amazon-seller-central.svg',
  '/connectors/amplitude.svg',
  '/connectors/asana.svg',
  '/connectors/aws.svg',
  '/connectors/basecamp.svg',
  '/connectors/bigcommerce.svg',
  '/connectors/bitbucket.svg',
  '/connectors/buffer.svg',
  '/connectors/calendly.svg',
  '/connectors/clickup.svg',
  '/connectors/confluence-cloud.svg',
  '/connectors/context7.svg',
  '/connectors/cursor.svg',
  '/connectors/data-for-seo.svg',
  '/connectors/discord.svg',
  '/connectors/etsy.svg',
  '/connectors/facebook-pages.svg',
  '/connectors/freshdesk.svg',
  '/connectors/slack.svg',
  '/connectors/github.svg',
  '/connectors/gitlab.svg',
  '/connectors/gmail.svg',
  '/connectors/google-ads.svg',
  '/connectors/google-analytics-4.svg',
  '/connectors/google-analytics.svg',
  '/connectors/google-calendar.svg',
  '/connectors/google-docs.svg',
  '/connectors/google-drive.svg',
  '/connectors/google-search-console.png',
  '/connectors/google-sheets.svg',
  '/connectors/google-slides.svg',
  '/connectors/helpscout.svg',
  '/connectors/hubspot.svg',
  '/connectors/indeed.svg',
  '/connectors/instagram.svg',
  '/connectors/intercom.svg',
  '/connectors/jira-cloud.svg',
  '/connectors/jira.svg',
  '/connectors/linear.svg',
  '/connectors/linkedin.svg',
  '/connectors/lovable.svg',
  '/connectors/mailchimp.svg',
  '/connectors/meta-ads.svg',
  '/connectors/microsoft-365-outlook.svg',
  '/connectors/microsoft-teams.svg',
  '/connectors/mixpanel.svg',
  '/connectors/monday.svg',
  '/connectors/notion.svg',
  '/connectors/paypal.svg',
  '/connectors/pinterest.svg',
  '/connectors/pipedrive.svg',
  '/connectors/quickbooks-online.svg',
  '/connectors/reddit.svg',
  '/connectors/salesforce.svg',
  '/connectors/segment.svg',
  '/connectors/semrush.svg',
  '/connectors/sendgrid.svg',
  '/connectors/sentry.svg',
  '/connectors/shopify.svg',
  '/connectors/snapchat.svg',
  '/connectors/snowflake.svg',
  '/connectors/square.svg',
  '/connectors/starships.svg',
  '/connectors/stripe.svg',
  '/connectors/supabase.svg',
  '/connectors/telegram.svg',
  '/connectors/tiktok.svg',
  '/connectors/trello.svg',
  '/connectors/twilio.svg',
  '/connectors/twitter.svg',
  '/connectors/vercel.svg',
  '/connectors/whatsapp.svg',
  '/connectors/whatsapp-meta.svg',
  '/connectors/woocommerce.svg',
  '/connectors/wordpress.svg',
  '/connectors/x-twitter.svg',
  '/connectors/x.svg',
  '/connectors/xero.svg',
  '/connectors/youtube.svg',
  '/connectors/zendesk.svg',
]

export default function ConnectorHighlights() {
  // Keep the grid visually complete on desktop: 10 columns x 7 rows = 70 tiles.
  // We reserve one tile for "99+", so render 69 connector icons.
  const displayConnectors = CONNECTOR_ICONS.slice(0, 69)
  const [pulsingIndex, setPulsingIndex] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setPulsingIndex(prev => {
        if (displayConnectors.length <= 1) return prev
        let next = prev
        while (next === prev) {
          next = Math.floor(Math.random() * displayConnectors.length)
        }
        return next
      })
    }, 1500)

    return () => clearInterval(id)
  }, [displayConnectors.length])

  return (
    <section className="mb-14 md:mb-16">
      <div className="rounded-3xl border border-slate-200 p-4 sm:p-5 md:p-6 shadow-sm" style={{ backgroundColor: '#F8F8FA' }}>
        <div className="connector-layout">
          <div
            className="connector-icons-wrap"
            style={{
              background: [
                'linear-gradient(95deg, rgba(189,126,52,0.92) 0%, rgba(150,70,156,0.90) 32%, rgba(114,47,166,0.92) 58%, rgba(39,24,94,0.95) 100%)',
                'radial-gradient(circle at 6% 50%, rgba(251,191,36,0.28) 0%, transparent 34%)',
                'radial-gradient(circle at 96% 52%, rgba(99,102,241,0.30) 0%, transparent 34%)',
              ].join(', '),
            }}
          >
            <div className="connector-highlights-grid-shell">
              <div className="connector-highlights-grid">
                {displayConnectors.map((iconSrc, idx) => (
                  <div
                    key={iconSrc}
                    className={`connector-highlights-tile relative rounded-xl bg-white border border-slate-200 shadow-[0_4px_12px_rgba(15,23,42,0.14)] flex items-center justify-center ${
                      pulsingIndex === idx ? 'connector-highlights-tile-pulsing' : ''
                    }`}
                  >
                    <div
                      className="connector-highlights-icon relative"
                    >
                      <Image src={iconSrc} alt="Connector logo" fill sizes="48px" className="object-contain" />
                    </div>
                  </div>
                ))}

                <div className="connector-highlights-tile rounded-xl bg-white border border-slate-200 shadow-[0_4px_12px_rgba(15,23,42,0.14)] flex items-center justify-center">
                  <span className="text-sm sm:text-base font-semibold text-slate-500">99+</span>
                </div>
              </div>
            </div>
          </div>

          <div className="connector-copy text-left rounded-2xl p-5 sm:p-6" style={{ backgroundColor: '#F8F8FA' }}>
            <h3 className="text-2xl sm:text-3xl md:text-4xl font-semibold text-slate-900 leading-tight">Connect the tools your team already runs on</h3>
            <p className="mt-3 text-sm sm:text-base text-slate-700 max-w-md">Unify your stack so agents can take action across your apps, data, and workflows from one place.</p>
            <div className="mt-6">
              <Link
                href="/login"
                className="inline-flex items-center justify-center h-11 px-6 text-sm sm:text-base font-semibold leading-none rounded-full whitespace-nowrap text-white bg-gradient-to-b from-amber-300 via-amber-400 to-amber-500 shadow-[0_4px_0_0_rgba(180,83,9,1)] hover:brightness-110 active:shadow-[0_2px_0_0_rgba(180,83,9,1)] active:-translate-y-[1px] transition"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      </div>
      <style jsx>{`
        .connector-layout {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .connector-icons-wrap {
          flex: 1 1 auto;
          border-radius: 16px;
          padding: 18px;
        }

        .connector-highlights-grid-shell {
          padding: 14px;
        }

        .connector-copy {
          flex: 0 0 320px;
        }

        .connector-highlights-grid {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 18px;
        }

        .connector-highlights-tile {
          aspect-ratio: 1 / 1;
          min-height: 44px;
          transition:
            transform 180ms ease-out,
            box-shadow 180ms ease-out,
            border-color 180ms ease-out;
          will-change: transform;
        }

        .connector-highlights-tile-pulsing {
          animation: connector-single-pulse 900ms ease-in-out;
        }

        .connector-highlights-tile:hover {
          transform: translateY(-3px) scale(1.1);
          border-color: rgba(59, 130, 246, 0.45);
          box-shadow: 0 14px 28px rgba(15, 23, 42, 0.28);
          z-index: 2;
        }

        .connector-highlights-icon {
          width: 53%;
          height: 53%;
        }

        @keyframes connector-single-pulse {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.24);
          }
        }

        @media (min-width: 640px) {
          .connector-layout {
            gap: 20px;
          }

          .connector-highlights-grid {
            grid-template-columns: repeat(8, minmax(0, 1fr));
            gap: 20px;
          }
          .connector-highlights-tile {
            min-height: 46px;
          }
          .connector-icons-wrap {
            padding: 20px;
          }
          .connector-highlights-grid-shell {
            padding: 16px;
          }
        }

        @media (min-width: 1024px) {
          .connector-layout {
            flex-direction: row;
            align-items: center;
            gap: 28px;
          }

          .connector-highlights-grid {
            grid-template-columns: repeat(10, minmax(0, 1fr));
            gap: 22px;
          }
          .connector-highlights-tile {
            min-height: 48px;
          }
          .connector-icons-wrap {
            padding: 22px;
          }
          .connector-highlights-grid-shell {
            padding: 18px;
          }
        }
      `}</style>
    </section>
  )
}
