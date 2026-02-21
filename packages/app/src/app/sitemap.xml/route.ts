export const dynamic = 'force-static'
export const revalidate = 86400 // 24 hours

export async function GET(_req: Request): Promise<Response> {
  // Sitemaps are served from the canonical apex domain (landing).
  return new Response('Not Found', { status: 404 })
}

