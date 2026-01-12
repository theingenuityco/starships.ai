'use client'


import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Disable caching in development for faster debugging
            staleTime: process.env.NODE_ENV === 'development' ? 0 : 1000 * 60 * 5, // 0 in dev, 5 minutes in prod
            gcTime: process.env.NODE_ENV === 'development' ? 0 : 1000 * 60 * 10, // 0 in dev, 10 minutes in prod
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  )
}
