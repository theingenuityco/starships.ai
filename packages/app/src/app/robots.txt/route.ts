export const dynamic = 'force-static'
export const revalidate = 86400 // 24 hours

function toRobotsTxt(lines: string[]): string {
  return `${lines.join('\n')}\n`
}

export async function GET(_req: Request): Promise<Response> {
  return new Response(toRobotsTxt(['User-agent: *', 'Disallow: /']), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=86400, stale-while-revalidate=86400',
    },
  })
}

