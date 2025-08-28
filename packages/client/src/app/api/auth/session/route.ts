import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { getUser, isAuthenticated, getAccessToken } = getKindeServerSession();
    const authenticated = await isAuthenticated();
    
    if (!authenticated) {
      return NextResponse.json({ 
        isAuthenticated: false,
        user: null,
        accessToken: null
      });
    }
    
    const user = await getUser();
    const accessToken = await getAccessToken();
    
    // Return the session data that the client needs
    return NextResponse.json({ 
      isAuthenticated: true,
      user,
      accessToken: accessToken || null
    });
  } catch (error) {
    console.error('[Session API] Error:', error);
    return NextResponse.json({ 
      isAuthenticated: false,
      user: null,
      accessToken: null,
      error: 'Failed to get session' 
    });
  }
}