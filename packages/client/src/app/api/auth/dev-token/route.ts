import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';
import { NextResponse } from 'next/server';
import { SignJWT } from 'jose';

// Development-only endpoint to generate a JWT token for authenticated users
// This works around Kinde's opaque token issues in local development
export async function GET() {
  // Only allow in development
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 });
  }
  
  try {
    const { isAuthenticated, getUser } = getKindeServerSession();
    
    const authenticated = await isAuthenticated();
    
    if (!authenticated) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    
    const user = await getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 500 });
    }
    
    // Create a development JWT token that matches what the server expects
    // This uses a simple secret for development only
    const secret = new TextEncoder().encode(
      process.env.KINDE_CLIENT_SECRET || 'development-secret-key-for-local-testing'
    );
    
    const token = await new SignJWT({ 
      sub: user.id,
      email: user.email,
      given_name: user.given_name,
      family_name: user.family_name,
      iss: process.env.KINDE_ISSUER_URL || 'https://starshipsai.kinde.com',
      aud: process.env.KINDE_CLIENT_ID || 'starships-client',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(secret);
    
    console.log('[Dev Token API] Generated development JWT for user:', user.id);
    return NextResponse.json({ token });
  } catch (error) {
    console.error('[Dev Token API] Error generating token:', error);
    return NextResponse.json({ error: 'Failed to generate token' }, { status: 500 });
  }
}