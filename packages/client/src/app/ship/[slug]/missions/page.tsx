'use client';

import { use } from 'react';
import { motion } from 'motion/react';
import { Target, Plus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface MissionsPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export default function MissionsPage({ params }: MissionsPageProps) {
  const { slug } = use(params);

  return (
    <div className="h-full command-deck-bg p-8 flex items-center justify-center">
      <motion.div 
        className="text-center max-w-md w-full"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <Card className="bg-card/50 backdrop-blur-sm border-2 border-primary/20">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Target className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl starship-accent">🎯 Missions</CardTitle>
            <CardDescription>
              Mission control for {slug}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground mb-6">
              A clean, efficient system for managing your starship's missions. 
              Ready to build something amazing.
            </p>
            <Button className="mb-4" disabled>
              <Plus className="w-4 h-4 mr-2" />
              Create Mission
            </Button>
            <div className="mt-6 p-4 bg-accent/50 rounded-lg">
              <p className="text-sm text-muted-foreground">
                Ready for your next implementation phase...
              </p>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}