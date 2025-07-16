'use client';

import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowLeft, Rocket } from 'lucide-react';
import Link from 'next/link';

interface StarshipExpeditionsContentProps {
  slug: string;
}

export function StarshipExpeditionsContent({ slug }: StarshipExpeditionsContentProps) {
  return (
    <div className="h-full flex flex-col">
      {/* Header with Back Navigation */}
      <div className="flex items-center justify-between p-6 border-b">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/ships">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Fleet
            </Link>
          </Button>
          <div className="text-sm text-muted-foreground">
            Starship: <span className="font-medium">{slug}</span>
          </div>
        </div>
      </div>

      {/* Main Content with Motion */}
      <div className="flex-1 command-deck-bg p-8 flex items-center justify-center">
        <motion.div
          className="text-center max-w-md w-full"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="bg-card/50 backdrop-blur-sm border-2 border-primary/20">
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <Rocket className="w-8 h-8 text-primary" />
              </div>
              <CardTitle className="text-2xl starship-accent">🚀 Expeditions</CardTitle>
              <CardDescription>
                Mission planning and expedition tracking for {slug}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <p className="text-muted-foreground">
                The Expeditions module will provide comprehensive mission tracking,
                outcome analysis, and strategic planning for your starship's
                exploration and operational activities.
              </p>
              <div className="mt-6 p-4 bg-accent/50 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  Coming soon in Phase 3...
                </p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}