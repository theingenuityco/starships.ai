import { NextResponse } from 'next/server';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function GET() {
  try {
    // In production, NEXT_PUBLIC_API_URL already includes /api
    // So we need to handle both cases:
    // - Local: http://localhost:4000 -> http://localhost:4000/api/starships/pricing
    // - Prod: https://starships.ai/api -> https://starships.ai/api/starships/pricing
    const endpoint = API_URL.endsWith('/api') 
      ? `${API_URL}/starships/pricing`  // Production case
      : `${API_URL}/api/starships/pricing`; // Local case
    
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