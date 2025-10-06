/**
 * Next.js API Route Proxy
 * 
 * Forwards all /api/v1/* requests to the backend server
 * This enables the elegant pattern of using relative URLs throughout the app
 */

import { NextRequest } from 'next/server'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

export async function GET(request: NextRequest, { params }: { params: { slug: string[] } }) {
  return proxyRequest(request, params.slug, 'GET')
}

export async function POST(request: NextRequest, { params }: { params: { slug: string[] } }) {
  return proxyRequest(request, params.slug, 'POST')
}

export async function PUT(request: NextRequest, { params }: { params: { slug: string[] } }) {
  return proxyRequest(request, params.slug, 'PUT')
}

export async function PATCH(request: NextRequest, { params }: { params: { slug: string[] } }) {
  return proxyRequest(request, params.slug, 'PATCH')
}

export async function DELETE(request: NextRequest, { params }: { params: { slug: string[] } }) {
  return proxyRequest(request, params.slug, 'DELETE')
}

async function proxyRequest(request: NextRequest, slug: string[], method: string) {
  try {
    const path = slug.join('/')
    const searchParams = request.nextUrl.searchParams.toString()
    const fullUrl = `${API_BASE_URL}/api/v1/${path}${searchParams ? `?${searchParams}` : ''}`

    // Get request body for POST/PUT/PATCH
    let body: string | undefined
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      try {
        body = await request.text()
      } catch (error) {
        // If body reading fails, continue without body
        body = undefined
      }
    }

    // Forward headers (excluding host and content-length which are auto-managed)
    const headers: Record<string, string> = {}
    request.headers.forEach((value, key) => {
      if (!['host', 'content-length', 'connection'].includes(key.toLowerCase())) {
        headers[key] = value
      }
    })

    const response = await fetch(fullUrl, {
      method,
      headers,
      body,
    })

    // Forward response headers and status
    const responseHeaders = new Headers()
    response.headers.forEach((value, key) => {
      responseHeaders.set(key, value)
    })

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    })
  } catch (error) {
    console.error(`[API Proxy] Error proxying ${method} /api/v1/${slug.join('/')}:`, error)
    return new Response(
      JSON.stringify({ error: 'Proxy error', message: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }
}