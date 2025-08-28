import { handleAuth } from "@kinde-oss/kinde-auth-nextjs/server";
import { NextRequest } from "next/server";

// Default Kinde auth handler with debug logging
const authHandler = handleAuth();

export async function GET(
  request: NextRequest, 
  context: { params: Promise<{ kindeAuth: string }> }
) {
  // Await params for Next.js 15
  const params = await context.params;
  const kindeAuth = params.kindeAuth;
  
  console.log('[Kinde Auth] Processing route:', kindeAuth);
  console.log('[Kinde Auth] Full URL:', request.url);
  console.log('[Kinde Auth] Environment:', {
    KINDE_CLIENT_ID: process.env.KINDE_CLIENT_ID ? 'Set' : 'Missing',
    KINDE_CLIENT_SECRET: process.env.KINDE_CLIENT_SECRET ? 'Set' : 'Missing', 
    KINDE_ISSUER_URL: process.env.KINDE_ISSUER_URL,
    KINDE_SITE_URL: process.env.KINDE_SITE_URL,
    KINDE_POST_LOGIN_REDIRECT_URL: process.env.KINDE_POST_LOGIN_REDIRECT_URL,
    KINDE_POST_LOGOUT_REDIRECT_URL: process.env.KINDE_POST_LOGOUT_REDIRECT_URL,
    NODE_ENV: process.env.NODE_ENV
  });

  try {
    // Get the response from the default handler - pass the original context with params
    const response = await authHandler(request, { params });
    
    // Log response details
    console.log('[Kinde Auth] Response status:', response.status);
    console.log('[Kinde Auth] Response headers:', Object.fromEntries(response.headers.entries()));
    
    const cookies = response.headers.getSetCookie();
    console.log('[Kinde Auth] Cookies being set:', cookies.length);
    if (cookies.length > 0) {
      cookies.forEach((cookie: string, i: number) => {
        console.log(`[Kinde Auth] Cookie ${i}:`, cookie);
      });
    } else {
      console.log('[Kinde Auth] WARNING: No cookies are being set by Kinde SDK!');
    }
    
    // Special logging for callback
    if (kindeAuth === 'kinde_callback') {
      const url = new URL(request.url);
      console.log('[Kinde Auth] Callback params:', {
        code: url.searchParams.get('code') ? 'Present' : 'Missing',
        state: url.searchParams.get('state') ? 'Present' : 'Missing',
        error: url.searchParams.get('error'),
        error_description: url.searchParams.get('error_description')
      });
      
      // Check if this is the issue - maybe we need to manually handle cookies?
      if (cookies.length === 0 && url.searchParams.get('code')) {
        console.log('[Kinde Auth] CRITICAL: Callback has code but no cookies are being set!');
        console.log('[Kinde Auth] This indicates Kinde SDK is not properly handling the callback');
      }
    }
    
    // For dev/local environments, we might need to handle cookies differently
    if (process.env.NODE_ENV === 'development' || 
        process.env.KINDE_SITE_URL?.startsWith('http://localhost')) {
      console.log('[Kinde Auth] Running in development mode');
      
      // If we're in the callback and no cookies are set, this is a problem
      if (kindeAuth === 'kinde_callback' && cookies.length === 0) {
        console.log('[Kinde Auth] Development mode: No cookies from SDK, response might be malformed');
      }
    }
    
    // Only modify cookies for actual HTTP production deployments
    if (process.env.NODE_ENV === 'production' && 
        process.env.KINDE_SITE_URL?.startsWith('http://') && 
        !process.env.KINDE_SITE_URL?.startsWith('https://')) {
      
      console.log('[Kinde Auth] Modifying cookies for HTTP production deployment');
      const modifiedResponse = new Response(response.body, response);
      const cookiesToModify = modifiedResponse.headers.getSetCookie();
      modifiedResponse.headers.delete('set-cookie');
      
      cookiesToModify.forEach((cookie: string) => {
        const modifiedCookie = cookie.replace(/;\s*Secure/gi, '');
        modifiedResponse.headers.append('set-cookie', modifiedCookie);
      });
      
      return modifiedResponse;
    }
    
    return response;
  } catch (error) {
    console.error('[Kinde Auth] Error:', error);
    throw error;
  }
}

export async function POST(
  request: NextRequest, 
  context: { params: Promise<{ kindeAuth: string }> }
) {
  return GET(request, context);
}