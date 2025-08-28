import { handleAuth } from "@kinde-oss/kinde-auth-nextjs/server";
import { NextRequest } from "next/server";

// Default Kinde auth handler - let the SDK handle everything
const authHandler = handleAuth();

export async function GET(request: NextRequest, props: { params: Promise<{ kindeAuth: string }> }) {
  const params = await props.params;
  console.log('[Auth Route] Processing:', params.kindeAuth, 'URL:', request.url);
  
  // Get the response from the default handler
  const response = await authHandler(request, { params });
  
  // Modify cookies for HTTP environments (including localhost development)
  // This handles both localhost development and HTTP production deployments
  const isLocalhost = process.env.KINDE_SITE_URL?.includes('localhost') || 
                     process.env.KINDE_SITE_URL?.includes('127.0.0.1');
  const isHttpUrl = process.env.KINDE_SITE_URL?.startsWith('http://') && 
                    !process.env.KINDE_SITE_URL?.startsWith('https://');
  
  if (isLocalhost || isHttpUrl) {
    console.log('[Auth] Modifying cookies for HTTP/localhost environment:', {
      isLocalhost,
      isHttpUrl,
      siteUrl: process.env.KINDE_SITE_URL
    });
    
    // Clone the response to modify headers
    const modifiedResponse = new Response(response.body, response);
    
    // Get all Set-Cookie headers
    const cookies = modifiedResponse.headers.getSetCookie();
    console.log('[Auth] Original cookies count:', cookies.length);
    
    // Clear existing cookies
    modifiedResponse.headers.delete('set-cookie');
    
    // Re-add cookies without Secure flag for HTTP
    cookies.forEach((cookie: string) => {
      // Remove Secure flag for HTTP environments
      let modifiedCookie = cookie.replace(/;\s*Secure/gi, '');
      
      // For localhost, adjust cookie settings for proper sharing
      if (isLocalhost) {
        // Ensure SameSite is Lax for localhost (allows cookies in navigation)
        modifiedCookie = modifiedCookie.replace(/;\s*SameSite=\w+/gi, '; SameSite=Lax');
        if (!modifiedCookie.includes('SameSite')) {
          modifiedCookie += '; SameSite=Lax';
        }
        
        // Ensure HttpOnly is NOT set for client-side access (Kinde SDK needs to read cookies)
        modifiedCookie = modifiedCookie.replace(/;\s*HttpOnly/gi, '');
        
        // Set explicit path to ensure cookies are available everywhere
        if (!modifiedCookie.includes('Path=')) {
          modifiedCookie += '; Path=/';
        }
      }
      
      console.log('[Auth] Setting modified cookie');
      modifiedResponse.headers.append('set-cookie', modifiedCookie);
    });
    
    console.log('[Auth] Modified cookies for HTTP/localhost environment');
    return modifiedResponse;
  }
  
  // For HTTPS (including dev.starships.ai), return unmodified response
  // Let Kinde SDK handle cookies properly
  return response;
}

export async function POST(request: NextRequest, props: { params: Promise<{ kindeAuth: string }> }) {
  return GET(request, props);
}