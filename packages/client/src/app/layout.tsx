import { GoogleAnalytics } from '@/components/analytics/google-analytics'
import { ThemeProvider } from '@/components/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { UI_TEXT } from '@/constants/text'
import { AuthProvider } from '@/providers/auth-provider'
import { QueryProvider } from '@/providers/query-provider'
import { SocketProvider } from '@/providers/socket-provider'
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ClientLayout } from './client-layout'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: `${UI_TEXT.APP_TITLE} - ${UI_TEXT.APP_DESCRIPTION}`,
  description: 'Connect with AI agents to boost your productivity and creativity',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <AuthProvider>
              <SocketProvider>
                <TooltipProvider>
                  <div className="min-h-screen bg-background">
                    <ClientLayout>{children}</ClientLayout>
                  </div>
                </TooltipProvider>
              </SocketProvider>
            </AuthProvider>
          </QueryProvider>
        </ThemeProvider>
        <GoogleAnalytics />
      </body>
    </html>
  )
}
