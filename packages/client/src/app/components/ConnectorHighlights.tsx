'use client'

import Image from 'next/image'
import { useEffect, useState } from 'react'

import { shellMuted, shellMutedLift } from '@/app/components/landing/landingSurface'

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
  // Use the full connector set so edge-to-edge layouts remain dense without oversized tiles.
  const displayConnectors = CONNECTOR_ICONS
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
    <section className="mb-14 md:mb-16" style={{ width: '100vw', marginLeft: 'calc(-50vw + 50%)', marginRight: 'calc(-50vw + 50%)' }}>
      <div className={`p-0 ${shellMuted} ${shellMutedLift}`}>
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
                  className={`connector-highlights-tile relative rounded-none bg-white border-2 border-slate-200 shadow-[3px_3px_0_0_rgb(226_232_240)] ${
                    pulsingIndex === idx ? 'connector-highlights-tile-pulsing' : ''
                  }`}
                >
                  <div className="connector-highlights-tile-inner">
                    <div className="connector-highlights-icon relative">
                      <Image src={iconSrc} alt="Connector logo" fill sizes="48px" className="object-contain" />
                    </div>
                  </div>
                </div>
              ))}

              <div className="connector-highlights-tile relative rounded-none bg-white border-2 border-slate-200 shadow-[3px_3px_0_0_rgb(226_232_240)]">
                <div className="connector-highlights-tile-inner">
                  <span className="text-sm sm:text-base font-semibold text-slate-500">99+</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <style jsx>{`
        .connector-icons-wrap {
          border-radius: 0;
          padding: 18px;
        }

        .connector-highlights-grid-shell {
          padding: 14px;
        }

        .connector-highlights-grid {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 18px;
        }

        .connector-highlights-tile {
          aspect-ratio: 1 / 1;
          min-height: 0;
          transform-origin: center center;
          transition: transform 220ms ease-out;
          will-change: transform;
        }

        .connector-highlights-tile-inner {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
        }

        .connector-highlights-tile:hover {
          transform: scale(1.24);
          z-index: 2;
        }

        .connector-highlights-tile-pulsing {
          animation: connector-single-pulse 900ms ease-in-out;
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
          .connector-highlights-grid {
            grid-template-columns: repeat(8, minmax(0, 1fr));
            gap: 18px;
          }
          .connector-highlights-tile {
            min-height: 0;
          }
          .connector-icons-wrap {
            padding: 20px;
          }
          .connector-highlights-grid-shell {
            padding: 16px;
          }
        }

        @media (min-width: 1024px) {
          .connector-highlights-grid {
            grid-template-columns: repeat(20, minmax(0, 1fr));
            gap: 16px;
          }
          .connector-highlights-tile {
            min-height: 0;
          }
          .connector-icons-wrap {
            padding: 22px;
          }
          .connector-highlights-grid-shell {
            padding: 18px;
          }
        }

        @media (min-width: 1280px) {
          .connector-highlights-grid {
            grid-template-columns: repeat(22, minmax(0, 1fr));
          }
        }

        @media (min-width: 1536px) {
          .connector-highlights-grid {
            grid-template-columns: repeat(24, minmax(0, 1fr));
          }
        }
      `}</style>
    </section>
  )
}
