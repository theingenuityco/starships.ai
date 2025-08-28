import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET() {
  try {
    const { isAuthenticated, getAccessToken, getAccessTokenRaw } = getKindeServerSession();
    
    const authenticated = await isAuthenticated();
    
    if (!authenticated) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    
    // Try multiple methods to get the token
    let token = null;
    
    // Method 1: Try getAccessTokenRaw which should return the full JWT
    try {
      const rawToken = await getAccessTokenRaw();
      if (rawToken) {
        token = rawToken;
        console.log('[Auth Token API] Got raw access token, length:', token.length);
      }
    } catch (error) {
      console.warn('[Auth Token API] getAccessTokenRaw failed:', error);
    }
    
    // Method 2: Try getAccessToken if raw didn't work
    if (!token) {
      try {
        const accessToken = await getAccessToken();
        if (accessToken) {
          token = accessToken;
          console.log('[Auth Token API] Got access token, length:', token.length);
        }
      } catch (error) {
        console.warn('[Auth Token API] getAccessToken failed:', error);
      }
    }
    
    // Method 3: Try to get token from cookies directly as last resort
    if (!token) {
      const cookieStore = await cookies();
      
      // Log all available cookies to debug
      const allCookies = cookieStore.getAll();
      console.log('[Auth Token API] Available cookies:', allCookies.map(c => c.name));
      
      // Try different possible cookie names that Kinde might use
      const possibleCookieNames = ['access_token', 'ac', 'id_token', 'kinde_token'];
      
      for (const cookieName of possibleCookieNames) {
        const tokenCookie = cookieStore.get(cookieName);
        if (tokenCookie && tokenCookie.value.includes('.')) {
          token = tokenCookie.value;
          console.log('[Auth Token API] Got token from cookie:', cookieName, 'length:', token.length);
          break;
        }
      }
    }
    
    if (!token) {
      console.error('[Auth Token API] Authenticated but no token available from any method');
      return NextResponse.json({ error: 'Token not available' }, { status: 500 });
    }
    
    // Validate token format (should be a JWT with 3 parts)
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      console.error('[Auth Token API] Invalid token format, parts:', tokenParts.length, 'token length:', token.length);
      return NextResponse.json({ error: 'Invalid token format' }, { status: 500 });
    }
    
    console.log('[Auth Token API] Providing valid JWT token for authenticated user');
    return NextResponse.json({ token });
  } catch (error) {
    console.error('[Auth Token API] Error getting token:', error);
    return NextResponse.json({ error: 'Failed to get token' }, { status: 500 });
  }
}