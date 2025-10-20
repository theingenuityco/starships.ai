import { ClientLayout } from '@/app/client-layout'
import '@/app/globals.css'
import { GoogleAnalytics } from '@/components/analytics/google-analytics'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/toast'
import { TooltipProvider } from '@/components/ui/tooltip'
import { UI_TEXT } from '@/constants/text'
import { AuthProvider } from '@/providers/auth-provider'
import { QueryProvider } from '@/providers/query-provider'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Starships.ai – Ship production AI agents fast',
  description: 'Design agent behavior, connect tools safely, and run with observability and guardrails—on a production-ready runtime.',
  openGraph: {
    title: 'Starships.ai – Ship production AI agents fast',
    description: 'Design agent behavior, connect tools safely, and run with observability and guardrails—on a production-ready runtime.',
    url: 'https://starships.ai',
    images: [{ url: '/og.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Starships.ai – Ship production AI agents fast',
    description: 'Design agent behavior, connect tools safely, and run with observability and guardrails—on a production-ready runtime.',
    images: ['/og.png'],
  },
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} app-gradient-bg`} suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <QueryProvider>
            <AuthProvider>
              <TooltipProvider>
                <div className="min-h-[100dvh] bg-background">
                  <ClientLayout>{children}</ClientLayout>
                  <Toaster />
                </div>
              </TooltipProvider>
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
        <GoogleAnalytics />
      </body>
    </html>
  )
}
