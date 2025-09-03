import { NextResponse } from 'next/server';
import { loadApiRuntimeConfig } from '@starships/env-config';

/**
 * Runtime Configuration Endpoint
 * Returns runtime configuration for client-side services
 */
export async function GET() {
  try {
    // Load configuration at runtime (not build time!)
    const { serverUrl, enableAuthTestingBackdoor } = loadApiRuntimeConfig();
    
    return NextResponse.json({
      serverUrl,
      enableAuthTestingBackdoor,
    });
  } catch (error) {
    console.error('Error loading runtime config:', error);
    return NextResponse.json(
      { error: 'Failed to load configuration' },
      { status: 500 }
    );
  }
}