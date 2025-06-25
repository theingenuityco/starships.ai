'use client';

import { useAuth } from "@/hooks/useAuth";
import { LoginButton } from "./LoginButton";
import { motion } from "motion/react";
import { Rocket, Stars, Zap } from "lucide-react";

interface AuthGateProps {
  children: React.ReactNode;
}

/**
 * Authentication gate component
 * Shows login UI for unauthenticated users, or renders children for authenticated users
 * Integrates with the existing space-themed design
 */
export function AuthGate({ children }: AuthGateProps) {
  const { isAuthenticated, isLoading } = useAuth();

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div
          className="flex flex-col items-center space-y-4"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          >
            <Rocket className="h-8 w-8 text-primary" />
          </motion.div>
          <p className="text-muted-foreground">Initializing starship systems...</p>
        </motion.div>
      </div>
    );
  }

  // Show landing page for unauthenticated users
  if (!isAuthenticated) {
    return <>{children}</>;
  }

  // Render protected content for authenticated users
  return <>{children}</>;
} 