import { handleAuth } from "@kinde-oss/kinde-auth-nextjs/server";
import { NextRequest, NextResponse } from "next/server";

// Custom handler to work with HTTP in production (temporary for MVP)
const authHandler = handleAuth();

export async function GET(request: NextRequest, { params }: { params: { kindeAuth: string } }) {
  // Get the response from the default handler
  const response = await authHandler(request, { params });
  
  // Special handling for callback to ensure cookies are properly set
  if (params.kindeAuth === 'kinde_callback') {
    // If this is a successful callback (redirect status), add a refresh flag
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location) {
        // Add a flag to force refresh on the client side
        const url = new URL(location, request.url);
        url.searchParams.set('auth_refresh', 'true');
        
        const newResponse = NextResponse.redirect(url);
        
        // Copy any cookies from the original response
        const cookies = response.headers.getSetCookie();
        cookies.forEach(cookie => {
          newResponse.headers.append('set-cookie', cookie);
        });
        
        return newResponse;
      }
    }
  }
  
  // If we're in production with HTTP, we need to modify cookie settings
  if (process.env.NODE_ENV === 'production' && process.env.KINDE_SITE_URL?.startsWith('http://')) {
    // Clone the response to modify headers
    const modifiedResponse = new Response(response.body, response);
    
    // Get all Set-Cookie headers
    const cookies = modifiedResponse.headers.getSetCookie();
    
    // Clear existing cookies
    modifiedResponse.headers.delete('set-cookie');
    
    // Re-add cookies without Secure flag for HTTP
    cookies.forEach(cookie => {
      // Remove Secure flag for HTTP deployment
      const modifiedCookie = cookie.replace(/;\s*Secure/gi, '');
      modifiedResponse.headers.append('set-cookie', modifiedCookie);
    });
    
    return modifiedResponse;
  }
  
  return response;
}

export async function POST(request: NextRequest, { params }: { params: { kindeAuth: string } }) {
  return GET(request, { params });
}