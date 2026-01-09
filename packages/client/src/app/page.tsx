import HomePageClient from './home-page-client'

// Public marketing page: cacheable + safe to serve from edge/CDN.
export const dynamic = 'force-static'
export const revalidate = 3600 // 1 hour

export default function HomePage() {
  return <HomePageClient />
}
