import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';
import { redirect } from 'next/navigation';
import FleetPageClient from './FleetPageClient';

export default async function ShipsPage() {
  // Check auth server-side
  const { isAuthenticated, getUser } = getKindeServerSession();
  
  try {
    const [authenticated, user] = await Promise.all([
      isAuthenticated(),
      getUser()
    ]);
    
    console.log('[Fleet Page] Auth check:', { authenticated, userId: user?.id });
    
    // Redirect to login if not authenticated
    if (!authenticated) {
      console.log('[Fleet Page] Not authenticated, redirecting to login');
      redirect('/api/auth/login?post_login_redirect_url=/fleet');
    }
    
    // Pass user info to client component
    return <FleetPageClient initialUser={user} />;
  } catch (error) {
    console.error('[Fleet Page] Auth check error:', error);
    // On error, redirect to login
    redirect('/api/auth/login?post_login_redirect_url=/fleet');
  }
}