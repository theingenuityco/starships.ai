import { NextRequest, NextResponse } from 'next/server';
import { loadApiRuntimeConfig } from '@starships/env-config';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Load API URL at runtime (not build time!)
    const { apiUrl } = loadApiRuntimeConfig();
    
    const response = await fetch(`${apiUrl}/waitlist/check`, {
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