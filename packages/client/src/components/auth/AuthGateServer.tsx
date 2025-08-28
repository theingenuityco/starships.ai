import { getKindeServerSession } from '@kinde-oss/kinde-auth-nextjs/server';
import { redirect } from 'next/navigation';

interface AuthGateServerProps {
  children: React.ReactNode;
}

/**
 * Server-side authentication gate
 * Checks auth on server and passes state to client
 */
export async function AuthGateServer({ children }: AuthGateServerProps) {
  const { isAuthenticated } = getKindeServerSession();
  const authenticated = await isAuthenticated();
  
  if (!authenticated) {
    redirect('/api/auth/login?post_login_redirect_url=/fleet');
  }
  
  return <>{children}</>;
}