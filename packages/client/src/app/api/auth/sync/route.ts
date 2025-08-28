import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// Force sync authentication state between server and client
export async function GET() {
  const { isAuthenticated, getUser, getAccessTokenRaw } = getKindeServerSession();
  
  const authenticated = await isAuthenticated();
  
  if (!authenticated) {
    return NextResponse.json({ 
      authenticated: false,
      message: 'Not authenticated on server' 
    });
  }
  
  const user = await getUser();
  
  // Try to get the access token
  let accessToken = null;
  try {
    accessToken = await getAccessTokenRaw();
  } catch (error) {
    console.warn('[Auth Sync] Could not get access token:', error);
  }
  
  // Get all Kinde-related cookies
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  const kindeCookies = allCookies.filter(c => 
    c.name.includes('kinde') || 
    c.name.includes('ac_') || 
    c.name.includes('id_token') ||
    c.name.includes('refresh_token')
  );
  
  console.log('[Auth Sync] Kinde cookies found:', kindeCookies.map(c => c.name));
  
  // Create response with user data
  const response = NextResponse.json({
    authenticated: true,
    user,
    hasToken: !!accessToken,
    cookiesFound: kindeCookies.length,
    timestamp: new Date().toISOString()
  });
  
  // If we have cookies that need to be set for client access, forward them
  kindeCookies.forEach(cookie => {
    // Ensure cookies are accessible to client-side JavaScript
    response.cookies.set({
      name: cookie.name,
      value: cookie.value,
      path: '/',
      sameSite: 'lax',
      secure: false, // For localhost
      httpOnly: false // Allow client-side access
    });
  });
  
  return response;
}