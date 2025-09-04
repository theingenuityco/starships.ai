import { NextRequest, NextResponse } from 'next/server';
import { getEnvConfig } from '@starships/env';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Load server URL at runtime (not build time!)
    const serverUrl = getEnvConfig().SERVER_URL;
    
    const response = await fetch(`${serverUrl}/api/waitlist/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    
    // Set cookie if approved
    if (data.isApproved) {
      const res = NextResponse.json(data);
      res.cookies.set('waitlist_validated', body.email.toLowerCase().trim(), {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 // 7 days in seconds
      });
      return res;
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Waitlist check error:', error);
    return NextResponse.json(
      { isApproved: false, message: 'Service temporarily unavailable' },
      { status: 500 }
    );
  }
}