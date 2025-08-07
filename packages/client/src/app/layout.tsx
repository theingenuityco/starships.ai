import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { QueryProvider } from '@/providers/query-provider'
import { AuthProvider } from '@/providers/auth-provider'
import { SocketProvider } from '@/providers/socket-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ClientLayout } from './client-layout'
import { UI_TEXT } from '@/constants/text'
import { Toaster } from '@/components/ui/toast'
import { SubscriptionProvider } from '@/contexts/SubscriptionContext'

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
          <AuthProvider>
            <SubscriptionProvider>
              <QueryProvider>
                <SocketProvider>
                  <TooltipProvider>
                    <div className="min-h-screen bg-background">
                      <ClientLayout>{children}</ClientLayout>
                    </div>
                  </TooltipProvider>
                </SocketProvider>
              </QueryProvider>
            </SubscriptionProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
