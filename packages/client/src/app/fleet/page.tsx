import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { redirect } from "next/navigation";
import FleetPageClient from "./FleetPageClient";

export default async function FleetPage() {
  // Server-side authentication check
  const { isAuthenticated, getUser } = getKindeServerSession();
  const authenticated = await isAuthenticated();
  
  // If not authenticated, redirect to home
  if (!authenticated) {
    redirect('/');
  }
  
  // Get user data server-side
  const user = await getUser();
  
  // Pass auth data to client component
  return <FleetPageClient user={user} isAuthenticated={authenticated} />;
}