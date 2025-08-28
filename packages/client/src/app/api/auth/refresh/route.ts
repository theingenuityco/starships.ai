import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';
import { NextResponse } from 'next/server';

// Endpoint to check authentication status and force client refresh
export async function GET() {
  const { isAuthenticated, getUser } = getKindeServerSession();
  
  const authenticated = await isAuthenticated();
  const user = authenticated ? await getUser() : null;
  
  return NextResponse.json({
    authenticated,
    user,
    timestamp: new Date().toISOString()
  });
}