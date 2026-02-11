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
          {`
(function () {
  try {
    var now = Date.now();
    var theme = null;
    try { theme = window.localStorage ? window.localStorage.getItem('theme') : null; } catch (e) { theme = null; }
    var prefersDark = null;
    try { prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { prefersDark = null; }
    var isDark = theme === 'dark' ? true : theme === 'light' ? false : !!prefersDark;
    // Match app theme background:
    // - light: hsl(38 30% 97.5%) ≈ #fbf9f7
    // - dark:  hsl(0 0% 0%)     = #000000
    var tile = isDark ? '#000000' : '#fbf9f7';
    var stroke = isDark ? '#ffffff' : '#111827';
    var opacity = isDark ? '1' : '0.75';
    var strokeWidth = '1.25';
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" data-ts="' + now + '">' +
      '<rect x="0.75" y="0.75" width="22.5" height="22.5" rx="5" fill="' + tile + '"/>' +
      '<g fill="none" stroke="' + stroke + '" stroke-width="' + strokeWidth + '" stroke-linecap="round" stroke-linejoin="round" opacity="' + opacity + '" vector-effect="non-scaling-stroke" transform="translate(2.5 2.5) scale(0.7916667)">' +
      '<path d="m11 16-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 21 3c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>' +
      '<path d="M8 13H3s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>' +
      '<path d="M11 16v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>' +
      '<circle cx="14.5" cy="9" r="1.5"/>' +
      '<line x1="6" y1="15" x2="2.5" y2="18.5"/>' +
      '<line x1="7.5" y1="16.5" x2="5.4" y2="18.6"/>' +
      '<line x1="9" y1="18" x2="7.6" y2="19.4"/>' +
      '</g></svg>';
    var href = 'data:image/svg+xml,' + encodeURIComponent(svg);

    // Remove competing icon links early so Chrome can't lock onto them.
    try {
      var icons = document.querySelectorAll('link[rel~="icon"]');
      for (var i = 0; i < icons.length; i++) {
        var el = icons[i];
        if (el && (el.id === 'app-favicon' || el.id === 'app-favicon-shortcut')) continue;
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }
    } catch (e) {}

    var existing = document.querySelector('link#app-favicon');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    var existingShortcut = document.querySelector('link#app-favicon-shortcut');
    if (existingShortcut && existingShortcut.parentNode) existingShortcut.parentNode.removeChild(existingShortcut);

    var link = document.createElement('link');
    link.id = 'app-favicon';
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    link.setAttribute('sizes', 'any');
    link.setAttribute('href', href);

    var shortcut = document.createElement('link');
    shortcut.id = 'app-favicon-shortcut';
    shortcut.rel = 'shortcut icon';
    shortcut.type = 'image/svg+xml';
    shortcut.setAttribute('sizes', 'any');
    shortcut.setAttribute('href', href);

    // Prepend so it's first.
    if (document.head && document.head.firstChild) {
      document.head.insertBefore(shortcut, document.head.firstChild);
      document.head.insertBefore(link, document.head.firstChild);
    } else if (document.head) {
      document.head.appendChild(link);
      document.head.appendChild(shortcut);
    }

    // Keep it first even if head mutates later.
    try {
      var obs = new MutationObserver(function () {
        var app = document.querySelector('link#app-favicon');
        var first = document.querySelector('link[rel~="icon"]');
        if (!app || (first && first.id !== 'app-favicon')) {
          try {
            var icons2 = document.querySelectorAll('link[rel~="icon"]');
            for (var j = 0; j < icons2.length; j++) {
              var el2 = icons2[j];
              if (el2 && (el2.id === 'app-favicon' || el2.id === 'app-favicon-shortcut')) continue;
              if (el2 && el2.parentNode) el2.parentNode.removeChild(el2);
            }
            var app2 = document.querySelector('link#app-favicon');
            var short2 = document.querySelector('link#app-favicon-shortcut');
            if (app2 && document.head) document.head.insertBefore(app2, document.head.firstChild);
            if (short2 && document.head) document.head.insertBefore(short2, document.head.firstChild);
          } catch (e) {}
        }
      });
      if (document.head) obs.observe(document.head, { childList: true });
    } catch (e) {}
  } catch (e) {}
})();`}
        </Script>
      </head>
      <body className={`${inter.className} app-gradient-bg`} suppressHydrationWarning>
        <SentryWrapper />
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <FaviconThemeSync />
          <QueryProvider>
            <AuthProvider>
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
