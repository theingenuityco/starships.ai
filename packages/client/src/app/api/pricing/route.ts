import { NextResponse } from 'next/server';
import { getEnvConfig } from '@starships/env';

export async function GET() {
  try {
    // Load server URL at runtime (not build time!)
    const serverUrl = getEnvConfig().SERVER_URL;
    
    const endpoint = `${serverUrl}/api/starships/pricing`;
    
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