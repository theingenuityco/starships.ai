import '@/app/globals.css'
import { AnalyticsProvider } from '@/components/analytics/analytics-provider'
import { SentryWrapper } from '@/components/sentry-wrapper'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/toast'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/providers/auth-provider'
import { QueryProvider } from '@/providers/query-provider'
import { AuthUserHtmlClassSync } from '@/components/auth/AuthUserHtmlClassSync'
import { FaviconThemeSync } from '@/components/theme/FaviconThemeSync'
import { MetaPixelHeadScript, MetaPixelNoScript } from '@/components/analytics/meta-pixel-snippets'
import { buildFaviconInitScriptSource } from '@/lib/faviconSvg'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import { Toaster as SonnerToaster } from 'sonner'
import { Suspense } from 'react'
import { getPublicEnvConfig } from '@starships/env/public'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  metadataBase: new URL('https://app.starships.ai'),
  title: 'Starships.ai | App',
  description: 'Starships.ai app',
  applicationName: 'Starships.ai',
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
  alternates: {
    canonical: 'https://app.starships.ai',
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

// Prevent iOS Safari "focus zoom" by disallowing page scaling.
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
} as const

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { META_PIXEL_ID } = getPublicEnvConfig()

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="app-favicon-init" strategy="beforeInteractive">
          {buildFaviconInitScriptSource()}
        </Script>
        <MetaPixelHeadScript pixelId={META_PIXEL_ID} />
      </head>
      <body className={`${inter.className} app-gradient-bg`} suppressHydrationWarning>
        <MetaPixelNoScript pixelId={META_PIXEL_ID} />
        <SentryWrapper />
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <QueryProvider>
            <AuthProvider>
              <FaviconThemeSync />
              <AuthUserHtmlClassSync />
              <TooltipProvider>
                <div className="min-h-[100dvh] bg-background">
                  {children}
                  <Toaster />
                  <SonnerToaster position="top-center" />
                </div>
              </TooltipProvider>
              <Suspense fallback={null}>
                <AnalyticsProvider />
              </Suspense>
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}

