import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const validatedEmail = request.cookies.get('waitlist_validated');
  
  if (validatedEmail) {
    return NextResponse.json({
      isValidated: true,
      email: validatedEmail.value
    });
  }

  return NextResponse.json({
    isValidated: false
  });
}