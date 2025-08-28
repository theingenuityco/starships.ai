import { NextResponse } from 'next/server';
import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';

/**
 * Kinde SDK auto-configuration endpoint
 * 
 * The Kinde SDK client automatically tries to call /api/auth/setup
 * to check for configuration. This endpoint returns a minimal success
 * response to prevent 404 errors in the browser console.
 * 
 * This is not a security issue - it just tells the SDK that no
 * special setup is required.
 */
export async function GET() {
  try {
    const { isAuthenticated } = getKindeServerSession();
    const authenticated = await isAuthenticated();
    
    return NextResponse.json({ 
      configured: true,
      authenticated,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({ 
      configured: true,
      authenticated: false,
      timestamp: new Date().toISOString()
    });
  }
}

export async function POST() {
  return NextResponse.json({ 
    configured: true,
    timestamp: new Date().toISOString()
  });
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}