import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/theme-provider'
import { StarshipProvider } from '@/components/state/starship-context'
import { ClientLayout } from './client-layout'
import { UI_TEXT } from '@/constants/text'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: `${UI_TEXT.APP_TITLE} - ${UI_TEXT.APP_DESCRIPTION}`,
  description: 'Connect with AI agents to boost your productivity and creativity',
  icons: {
    icon: '/favicon.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <StarshipProvider>
            {/* TODO: Add error boundaries for crash protection */}
            <div className="min-h-screen bg-background">
              <ClientLayout>{children}</ClientLayout>
            </div>
          </StarshipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
} 