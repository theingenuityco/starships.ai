import { NextResponse } from 'next/server';

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
  return NextResponse.json({ 
    configured: true 
  });
}

export async function POST() {
  return NextResponse.json({ 
    configured: true 
  });
}