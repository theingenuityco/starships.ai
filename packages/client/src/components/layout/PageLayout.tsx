'use client';

import { motion } from 'motion/react';
import { AuthGate } from '@/components/auth/AuthGate';
import { cn } from '@/lib/utils';

interface PageLayoutProps {
  children: React.ReactNode;
  title?: string;
  description?: string;
  showHeader?: boolean;
  className?: string;
  requireAuth?: boolean;
  headerActions?: React.ReactNode;
}

export function PageLayout({
  children,
  title,
  description,
  showHeader = false,
  className,
  requireAuth = true,
  headerActions
}: PageLayoutProps) {
  const content = (
    <div className={cn("h-full w-full", className)}>
      {showHeader && (title || description) && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="container mx-auto px-4 py-8"
        >
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between mb-8">
            <div className="space-y-1">
              {title && (
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  {title}
                </h1>
              )}
              {description && (
                <p className="text-gray-600 mt-2">
                  {description}
                </p>
              )}
            </div>
            {headerActions && (
              <div className="flex-shrink-0">
                {headerActions}
              </div>
            )}
          </div>
        </motion.div>
      )}
      
      <div className={cn(
        "container mx-auto px-4 py-8",
        showHeader && (title || description) 
          ? "h-[calc(100%-140px)]" 
          : "h-full"
      )}>
        {children}
      </div>
    </div>
  );

  if (requireAuth) {
    return <AuthGate>{content}</AuthGate>;
  }

  return content;
}