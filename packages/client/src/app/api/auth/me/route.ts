import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { getUser, isAuthenticated } = getKindeServerSession();
    const authenticated = await isAuthenticated();
    
    console.log('[Auth Me] Checking authentication status:', authenticated);
    
    if (!authenticated) {
      return NextResponse.json({ 
        authenticated: false,
        user: null 
      });
    }
    
    const user = await getUser();
    console.log('[Auth Me] User found:', user?.email);
    
    return NextResponse.json({ 
      authenticated: true,
      user 
    });
  } catch (error) {
    console.error('[Auth Me] Error:', error);
    return NextResponse.json({ 
      authenticated: false,
      user: null,
      error: 'Failed to get user session' 
    }, { status: 500 });
  }
}