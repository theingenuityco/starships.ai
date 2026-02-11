import { ClientLayout } from '@/app/client-layout'
import '@/app/globals.css'
import { AnalyticsProvider } from '@/components/analytics/analytics-provider'
import { SentryWrapper } from '@/components/sentry-wrapper'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/toast'
import { TooltipProvider } from '@/components/ui/tooltip'
import { UserbackWrapper } from '@/components/userback-wrapper'
import { UI_TEXT } from '@/constants/text'
import { AuthProvider } from '@/providers/auth-provider'
import { QueryProvider } from '@/providers/query-provider'
import { AuthUserHtmlClassSync } from '@/components/auth/AuthUserHtmlClassSync'
import { FaviconThemeSync } from '@/components/theme/FaviconThemeSync'
import { buildFaviconInitScriptSource } from '@/lib/faviconSvg'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import { Toaster as SonnerToaster } from 'sonner'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  metadataBase: new URL('https://starships.ai'),
  title: 'Starships.ai | Hire your AI staff, brief them in plain language',
  description: 'Starships.ai is a workspace to assemble AI staff, connect tools, set guardrails, and collaborate to get real work done. Start from Marketplace templates and deploy in minutes.',
  applicationName: 'Starships.ai',
  authors: [{ name: 'Starships.ai' }],
  creator: 'Starships.ai',
  publisher: 'Starships.ai',
  keywords: [
    'AI agents',
    'AI staff',
    'AI teammates',
    'agentic workspace',
    'production AI',
    'agent marketplace',
    'agent templates',
    'workflow automation',
    'tool calling',
    'AI tools',
    'guardrails',
    'observability',
    'task automation',
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: 'https://starships.ai',
  },
  category: 'technology',
  openGraph: {
    type: 'website',
    siteName: 'Starships.ai',
    title: 'Starships.ai | Hire your AI staff, brief them in plain language',
    description: 'Assemble AI staff, connect tools, set guardrails, and collaborate in one workspace. Start from Marketplace templates and deploy in minutes.',
    url: 'https://starships.ai',
    locale: 'en_US',
    images: [
      {
        url: '/static-assets/og.jpg',
        width: 1200,
        height: 630,
        alt: 'Starships.ai | Hire your AI staff, brief them in plain language',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Starships.ai | Hire your AI staff, brief them in plain language',
    description: 'Assemble AI staff, connect tools, set guardrails, and collaborate in one workspace. Start from Marketplace templates and deploy in minutes.',
    images: ['/static-assets/og.jpg'],
  },
  icons: {
    apple: '/favicons/apple-icon.png',
  },
  appleWebApp: {
    title: 'Starships.ai',
    statusBarStyle: 'black-translucent',
    capable: true,
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="app-favicon-init" strategy="beforeInteractive">
          {buildFaviconInitScriptSource()}
        </Script>
      </head>
      <body className={`${inter.className} app-gradient-bg`} suppressHydrationWarning>
        <SentryWrapper />
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <QueryProvider>
            <AuthProvider>
              <FaviconThemeSync />
              <AuthUserHtmlClassSync />
              <UserbackWrapper>
                <TooltipProvider>
                  <div className="min-h-[100dvh] bg-background">
                    <ClientLayout>{children}</ClientLayout>
                    <Toaster />
                    <SonnerToaster position="top-center" />
                  </div>
                </TooltipProvider>
              </UserbackWrapper>
              <AnalyticsProvider />
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
