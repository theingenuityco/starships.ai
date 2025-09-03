import { NextRequest, NextResponse } from 'next/server';
import { loadApiRuntimeConfig } from '@starships/env-config';
import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';

/**
 * API Proxy Route - Forwards requests to the backend with runtime configuration
 * This replaces direct client-to-backend calls that used NEXT_PUBLIC_API_URL
 * Following the same pattern as the Kinde auth route for runtime configuration
 */
async function proxyRequest(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    // Load API config at runtime (not build time!)
    const { apiUrl } = loadApiRuntimeConfig();
    
    // Reconstruct the API path
    const path = params.path.join('/');
    const url = new URL(`${apiUrl}/${path}${request.nextUrl.search}`);
    
    // Prepare headers
    const headers: HeadersInit = {};
    
    // Forward relevant headers
    const contentType = request.headers.get('content-type');
    if (contentType) {
      headers['Content-Type'] = contentType;
    }
    
    // Add authentication if available
    try {
      const { getAccessToken } = getKindeServerSession();
      const token = await getAccessToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    } catch (error) {
      // Auth not available, continue without token
    }
    
    // Forward the request
    const response = await fetch(url.toString(), {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.text(),
    });
    
    // Forward the response
    const responseData = await response.text();
    
    return new NextResponse(responseData, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
      },
    });
  } catch (error) {
    console.error('Backend proxy error:', error);
    return NextResponse.json(
      { error: 'Backend request failed' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest, context: { params: { path: string[] } }) {
  return proxyRequest(request, context);
}

export async function POST(request: NextRequest, context: { params: { path: string[] } }) {
  return proxyRequest(request, context);
}

export async function PUT(request: NextRequest, context: { params: { path: string[] } }) {
  return proxyRequest(request, context);
}

export async function DELETE(request: NextRequest, context: { params: { path: string[] } }) {
  return proxyRequest(request, context);
}

export async function PATCH(request: NextRequest, context: { params: { path: string[] } }) {
  return proxyRequest(request, context);
}