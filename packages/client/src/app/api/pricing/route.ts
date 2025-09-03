import { NextResponse } from 'next/server';
import { loadApiRuntimeConfig } from '@starships/env-config';

export async function GET() {
  try {
    // Load API URL at runtime (not build time!)
    // Following the same pattern as Kinde runtime configuration
    const { apiUrl } = loadApiRuntimeConfig();
    
    const endpoint = `${apiUrl}/starships/pricing`;
    
    const response = await fetch(endpoint, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching pricing data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pricing data' },
      { status: 500 }
    );
  }
}