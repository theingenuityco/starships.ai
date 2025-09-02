'use client';

import { useState } from 'react';
import { motion } from 'motion/react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useStarships } from '@/hooks/useStarships';

interface FleetProps {
  autoOpenCreate?: boolean;
  onCreateSuccess?: () => void;
  className?: string;
}

export function Fleet({ 
  autoOpenCreate, 
  onCreateSuccess, 
  className 
}: FleetProps) {
  const { data: starships, isLoading } = useStarships();
  
  if (isLoading) {
    return (
      <div className="h-full bg-background p-8 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  return (
    <div className={`h-full bg-background p-8 ${className}`}>
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Fleet Command</h1>
          <p className="text-muted-foreground">Manage your starship fleet</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Create New Starship Card */}
          <Card className="border-dashed border-2 hover:border-primary/50 transition-colors">
            <CardContent className="flex flex-col items-center justify-center h-48 p-6">
              <Button
                size="lg"
                className="w-full"
                onClick={() => {
                  // Handle create starship logic here
                  // This would typically open a modal or navigate to create page
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Create New Starship
              </Button>
            </CardContent>
          </Card>

          {/* Existing Starships */}
          {starships?.starships?.map((starship) => (
            <motion.div
              key={starship.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="hover:shadow-lg transition-all duration-200">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{starship.name}</span>
                    <span className="text-sm font-normal text-muted-foreground capitalize">
                      {starship.class}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Status:</span>
                      <span className={`capitalize ${
                        starship.status === 'active' 
                          ? 'text-green-600' 
                          : 'text-orange-600'
                      }`}>
                        {starship.status}
                      </span>
                    </div>
                    {starship.slug && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Slug:</span>
                        <span className="font-mono text-xs">{starship.slug}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {!starships?.starships?.length && (
          <div className="text-center py-12">
            <h3 className="text-lg font-medium text-foreground mb-2">No starships yet</h3>
            <p className="text-muted-foreground mb-6">Create your first starship to get started</p>
            <Button size="lg">
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Starship
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}