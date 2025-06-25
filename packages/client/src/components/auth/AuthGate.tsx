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

  // Show login screen for unauthenticated users
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-full max-w-md px-6">
          <motion.div
            className="text-center space-y-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            {/* Logo/Branding */}
            <motion.div
              className="flex justify-center"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 100 }}
            >
              <div className="relative">
                <div className="w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center">
                  <Rocket className="h-10 w-10 text-primary" />
                </div>
                <motion.div
                  className="absolute -top-2 -right-2"
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  <Stars className="h-6 w-6 text-yellow-500" />
                </motion.div>
              </div>
            </motion.div>

            {/* Welcome Text */}
            <div className="space-y-4">
              <motion.h1
                className="text-3xl font-bold tracking-tight"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                Welcome to Starships AI
              </motion.h1>
              <motion.p
                className="text-muted-foreground text-lg"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                Access the Command Deck and explore AI-powered conversations
              </motion.p>
            </div>

            {/* Auth Buttons */}
            <motion.div
              className="space-y-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              <LoginButton size="lg" className="w-full">
                <Zap className="h-4 w-4" />
                Enter Command Deck
              </LoginButton>
              
              <p className="text-sm text-muted-foreground">
                Secure authentication powered by Kinde
              </p>
            </motion.div>
          </motion.div>
        </div>
      </div>
    );
  }

  // Render protected content for authenticated users
  return <>{children}</>;
} 