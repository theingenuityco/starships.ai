import { handleAuth } from "@kinde-oss/kinde-auth-nextjs/server";
import { NextRequest } from "next/server";

// Default Kinde auth handler - let the SDK handle everything
const authHandler = handleAuth();

export async function GET(request: NextRequest, { params }: { params: { kindeAuth: string } }) {
  // Get the response from the default handler
  const response = await authHandler(request, { params });
  
  // Only modify cookies for actual HTTP deployments (not HTTPS)
  // dev.starships.ai uses HTTPS, so it doesn't need modifications
  if (process.env.NODE_ENV === 'production' && 
      process.env.KINDE_SITE_URL?.startsWith('http://') && 
      !process.env.KINDE_SITE_URL?.startsWith('https://')) {
    
    // Clone the response to modify headers
    const modifiedResponse = new Response(response.body, response);
    
    // Get all Set-Cookie headers
    const cookies = modifiedResponse.headers.getSetCookie();
    
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
}

export async function POST(request: NextRequest, { params }: { params: { kindeAuth: string } }) {
  return GET(request, { params });
}