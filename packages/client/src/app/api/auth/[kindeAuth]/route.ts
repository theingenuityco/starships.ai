import { NextRequest, NextResponse } from "next/server";
import { loadKindeRuntimeConfig } from '@starships/env-config';

// Dynamically import Kinde at runtime to avoid build-time env validation
export async function GET(request: NextRequest, { params }: { params: { kindeAuth: string } }) {
  try {
    // Load Kinde config at runtime and set in process.env
    const config = loadKindeRuntimeConfig();
    
    // Check if Kinde is configured
    if (!config.KINDE_ISSUER_URL) {
      console.warn('Kinde is not configured. Set KINDE_ISSUER_URL in your environment variables.');
      return NextResponse.json(
        { error: 'Authentication service not configured' },
        { status: 503 }
      );
    }
    
    // Only import and initialize Kinde when configured
    const { handleAuth } = await import("@kinde-oss/kinde-auth-nextjs/server");
    const handler = handleAuth();
    return handler(request, { params });
  } catch (error) {
    console.error('Kinde auth error:', error);
    return NextResponse.json(
      { error: 'Authentication service error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: { params: { kindeAuth: string } }) {
  try {
    // Load Kinde config at runtime and set in process.env
    const config = loadKindeRuntimeConfig();
    
    // Check if Kinde is configured
    if (!config.KINDE_ISSUER_URL) {
      console.warn('Kinde is not configured. Set KINDE_ISSUER_URL in your environment variables.');
      return NextResponse.json(
        { error: 'Authentication service not configured' },
        { status: 503 }
      );
    }
    
    const { handleAuth } = await import("@kinde-oss/kinde-auth-nextjs/server");
    const handler = handleAuth();
    return handler(request, { params });
  } catch (error) {
    console.error('Kinde auth error:', error);
    return NextResponse.json(
      { error: 'Authentication service error' },
      { status: 500 }
    );
  }
} 
