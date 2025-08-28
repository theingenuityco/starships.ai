import { handleAuth } from "@kinde-oss/kinde-auth-nextjs/server";
import { NextRequest } from "next/server";

// Default Kinde auth handler with debug logging
const authHandler = handleAuth();

export async function GET(request: NextRequest, { params }: { params: { kindeAuth: string } }) {
  console.log('[Kinde Auth] Processing route:', params.kindeAuth);
  console.log('[Kinde Auth] Full URL:', request.url);
  console.log('[Kinde Auth] Environment:', {
    KINDE_CLIENT_ID: process.env.KINDE_CLIENT_ID ? 'Set' : 'Missing',
    KINDE_CLIENT_SECRET: process.env.KINDE_CLIENT_SECRET ? 'Set' : 'Missing', 
    KINDE_ISSUER_URL: process.env.KINDE_ISSUER_URL,
    KINDE_SITE_URL: process.env.KINDE_SITE_URL,
    KINDE_POST_LOGIN_REDIRECT_URL: process.env.KINDE_POST_LOGIN_REDIRECT_URL,
    KINDE_POST_LOGOUT_REDIRECT_URL: process.env.KINDE_POST_LOGOUT_REDIRECT_URL,
    KINDE_COOKIE_DOMAIN: process.env.KINDE_COOKIE_DOMAIN,
    NODE_ENV: process.env.NODE_ENV
  });

  try {
    // Get the response from the default handler
    const response = await authHandler(request, { params });
    
    // Log response details
    console.log('[Kinde Auth] Response status:', response.status);
    const cookies = response.headers.getSetCookie();
    console.log('[Kinde Auth] Cookies being set:', cookies.length);
    cookies.forEach((cookie: string, i: number) => {
      // Log first 100 chars of each cookie for debugging
      console.log(`[Kinde Auth] Cookie ${i}:`, cookie.substring(0, 100) + '...');
    });
    
    // Special logging for callback
    if (params.kindeAuth === 'kinde_callback') {
      const url = new URL(request.url);
      console.log('[Kinde Auth] Callback params:', {
        code: url.searchParams.get('code') ? 'Present' : 'Missing',
        state: url.searchParams.get('state') ? 'Present' : 'Missing',
        error: url.searchParams.get('error'),
        error_description: url.searchParams.get('error_description')
      });
    }
    
    // Only modify cookies for actual HTTP deployments (not HTTPS)
    // dev.starships.ai uses HTTPS, so it doesn't need modifications
    if (process.env.NODE_ENV === 'production' && 
        process.env.KINDE_SITE_URL?.startsWith('http://') && 
        !process.env.KINDE_SITE_URL?.startsWith('https://')) {
      
      console.log('[Kinde Auth] Modifying cookies for HTTP deployment');
      // Clone the response to modify headers
      const modifiedResponse = new Response(response.body, response);
      
      // Clear existing cookies
      modifiedResponse.headers.delete('set-cookie');
      
      // Re-add cookies without Secure flag for HTTP
      cookies.forEach((cookie: string) => {
        // Remove Secure flag for HTTP deployment
        const modifiedCookie = cookie.replace(/;\s*Secure/gi, '');
        modifiedResponse.headers.append('set-cookie', modifiedCookie);
      });
      
      return modifiedResponse;
    }
    
    // For HTTPS (including dev.starships.ai), return unmodified response
    // Let Kinde SDK handle cookies properly
    return response;
  } catch (error) {
    console.error('[Kinde Auth] Error:', error);
    throw error;
  }
}

export async function POST(request: NextRequest, { params }: { params: { kindeAuth: string } }) {
  return GET(request, { params });
}