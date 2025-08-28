import { NextResponse } from 'next/server';
import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';

/**
 * Check authentication status from server-side
 * Used to verify if cookies are set correctly
 */
export async function GET() {
  try {
    const { getUser, isAuthenticated, getAccessToken } = getKindeServerSession();
    
    const [user, authenticated, accessToken] = await Promise.all([
      getUser(),
      isAuthenticated(),
      getAccessToken()
    ]);

    return NextResponse.json({
      authenticated,
      user: user ? {
        id: user.id,
        email: user.email,
        name: user.given_name || user.family_name 
          ? `${user.given_name} ${user.family_name}`.trim() 
          : null
      } : null,
      hasAccessToken: !!accessToken
    });
  } catch (error) {
    console.error('[AUTH] /api/auth/me error:', error);
    return NextResponse.json({ 
      authenticated: false, 
      user: null,
      hasAccessToken: false,
      error: 'Failed to check authentication'
    });
  }
}