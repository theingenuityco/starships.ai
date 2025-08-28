import { NextRequest, NextResponse } from 'next/server';
import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';

/**
 * Force refresh authentication state
 * This endpoint helps sync client and server auth state
 */
export async function GET(request: NextRequest) {
  try {
    const { getUser, isAuthenticated, getAccessToken } = getKindeServerSession();
    
    const [user, authenticated, token] = await Promise.all([
      getUser(),
      isAuthenticated(),
      getAccessToken()
    ]);

    // If authenticated on server, set a flag to force client refresh
    if (authenticated && user) {
      const response = NextResponse.json({
        authenticated: true,
        user: {
          id: user.id,
          email: user.email
        },
        needsClientRefresh: true
      });

      // Set a temporary cookie to signal the client needs to refresh
      response.cookies.set('kinde_needs_refresh', 'true', {
        httpOnly: false, // Allow JavaScript to read this
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 10, // Expires in 10 seconds
        path: '/'
      });

      return response;
    }

    return NextResponse.json({
      authenticated: false,
      needsClientRefresh: false
    });
  } catch (error) {
    console.error('[AUTH] Refresh check error:', error);
    return NextResponse.json({
      authenticated: false,
      error: 'Failed to check auth state'
    });
  }
}