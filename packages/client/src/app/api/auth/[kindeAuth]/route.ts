import { handleAuth } from "@kinde-oss/kinde-auth-nextjs/server";
import { NextRequest, NextResponse } from "next/server";

// Custom handler to ensure cookies work properly across different environments
const authHandler = handleAuth();

export async function GET(request: NextRequest, { params }: { params: { kindeAuth: string } }) {
  try {
    // Log for debugging
    console.log('[Auth Route] Processing:', params.kindeAuth);
    console.log('[Auth Route] URL:', request.url);
    console.log('[Auth Route] Headers:', Object.fromEntries(request.headers.entries()));
    
    // Get the response from the default Kinde handler
    const response = await authHandler(request, { params });
    
    // Log response details
    const cookies = response.headers.getSetCookie();
    console.log('[Auth Route] Response status:', response.status);
    console.log('[Auth Route] Response cookies count:', cookies.length);
    
    // Check environment configuration
    const siteUrl = process.env.KINDE_SITE_URL || '';
    const cookieDomain = process.env.KINDE_COOKIE_DOMAIN || '';
    const isHttpOnly = siteUrl.startsWith('http://') && !siteUrl.startsWith('https://');
    
    console.log('[Auth Route] Environment:', {
      KINDE_SITE_URL: siteUrl,
      KINDE_COOKIE_DOMAIN: cookieDomain,
      NODE_ENV: process.env.NODE_ENV,
      isHttpOnly
    });
    
    // For callback route, ensure cookies are set properly
    if (params.kindeAuth === 'kinde_callback' && cookies.length > 0) {
      console.log('[Auth Route] Processing callback, modifying cookies for environment');
      
      // Clone the response to modify headers
      const modifiedResponse = new Response(response.body, response);
      
      // Clear existing cookies
      modifiedResponse.headers.delete('set-cookie');
      
      // Process each cookie
      cookies.forEach((cookie, index) => {
        let modifiedCookie = cookie;
        console.log(`[Auth Route] Original cookie ${index}:`, cookie.substring(0, 100));
        
        // For HTTP-only deployments, remove Secure flag
        if (isHttpOnly) {
          modifiedCookie = modifiedCookie.replace(/;\s*Secure/gi, '');
          console.log('[Auth Route] Removed Secure flag for HTTP');
        }
        
        // Ensure SameSite is set correctly for cross-origin auth flow
        if (!modifiedCookie.includes('SameSite=')) {
          modifiedCookie += '; SameSite=Lax';
        } else {
          // Ensure it's Lax, not Strict (which would break OAuth flow)
          modifiedCookie = modifiedCookie.replace(/SameSite=Strict/gi, 'SameSite=Lax');
        }
        
        // For dev subdomain, ensure domain is set correctly if not already present
        if (cookieDomain && !modifiedCookie.includes('Domain=')) {
          modifiedCookie += `; Domain=${cookieDomain}`;
          console.log('[Auth Route] Added domain:', cookieDomain);
        }
        
        // Ensure Path is set to root if not specified
        if (!modifiedCookie.includes('Path=')) {
          modifiedCookie += '; Path=/';
        }
        
        console.log(`[Auth Route] Modified cookie ${index}:`, modifiedCookie.substring(0, 100));
        modifiedResponse.headers.append('set-cookie', modifiedCookie);
      });
      
      return modifiedResponse;
    }
    
    // For other routes or when no cookies to modify, return original response
    return response;
  } catch (error) {
    console.error('[Auth Route] Error:', error);
    
    // Return a proper error response
    return NextResponse.json(
      { 
        error: 'Authentication handler error', 
        details: error instanceof Error ? error.message : 'Unknown error',
        route: params.kindeAuth 
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: { params: { kindeAuth: string } }) {
  return GET(request, { params });
}