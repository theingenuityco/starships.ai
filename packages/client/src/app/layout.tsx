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
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Toaster as SonnerToaster } from 'sonner'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  metadataBase: new URL('https://starships.ai'),
  title: 'Starships.ai | Hire your AI team, brief them in plain language',
  description: 'Starships.ai is a workspace to assemble AI teammates, connect tools, set guardrails, and collaborate to get real work done. Start from Marketplace templates and deploy in minutes.',
  applicationName: 'Starships.ai',
  authors: [{ name: 'Starships.ai' }],
  creator: 'Starships.ai',
  publisher: 'Starships.ai',
  keywords: [
    'AI agents',
    'AI teammates',
    'AI team',
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
    title: 'Starships.ai | Hire your AI team, brief them in plain language',
    description: 'Assemble AI teammates, connect tools, set guardrails, and collaborate in one workspace. Start from Marketplace templates and deploy in minutes.',
    url: 'https://starships.ai',
    locale: 'en_US',
    images: [
      {
        url: '/static-assets/og.jpg',
        width: 1200,
        height: 630,
        alt: 'Starships.ai | Hire your AI team, brief them in plain language',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Starships.ai | Hire your AI team, brief them in plain language',
    description: 'Assemble AI teammates, connect tools, set guardrails, and collaborate in one workspace. Start from Marketplace templates and deploy in minutes.',
    images: ['/static-assets/og.jpg'],
  },
  icons: {
    icon: [
      { url: '/favicons/favicon.ico', sizes: 'any' },
      { url: '/favicons/icon.svg', type: 'image/svg+xml' },
      { url: '/favicons/icon.png', sizes: '96x96', type: 'image/png' },
    ],
    apple: '/favicons/apple-icon.png',
  },
  appleWebApp: {
    title: 'Starships.ai',
    statusBarStyle: 'black-translucent',
    capable: true,
  },
  manifest: '/manifest.json',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} app-gradient-bg`} suppressHydrationWarning>
        <SentryWrapper />
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <QueryProvider>
            <AuthProvider>
              <UserbackWrapper>
                <TooltipProvider>
                  <div className="min-h-[100dvh] bg-background">
                    <ClientLayout>{children}</ClientLayout>
                    <Toaster />
                    <SonnerToaster position="top-center" />
                  </div>
                </TooltipProvider>
              </UserbackWrapper>
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
        <AnalyticsProvider />
      </body>
    </html>
  )
}
