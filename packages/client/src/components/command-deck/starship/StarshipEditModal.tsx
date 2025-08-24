'use client';

import React, { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Edit3, 
  Save, 
  X, 
  Loader2,
  Rocket,
  AlertCircle 
} from 'lucide-react';
import { motion } from 'motion/react';
import { useStarshipStore } from '@/store/starship-store';
import { cn } from '@/lib/utils';

interface StarshipEditModalProps {
  starshipId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface StarshipEditFormData {
  name: string;
  status: 'active' | 'inactive';
  class: 'scout' | 'cruiser' | 'draught';
}

// Helper functions to maintain UI consistency
const getClassIcon = (classId: string) => {
  const icons = {
    scout: '🚀',
    cruiser: '🛸', 
    draught: '🌌'
  };
  return icons[classId as keyof typeof icons] || '🚀';
};

const getClassFeatures = (classId: string) => {
  const features = {
    scout: [
      'Rapid deployment capabilities',
      'Advanced scanning equipment',
      'Stealth technology',
      'Optimal for single-agent operations'
    ],
    cruiser: [
      'Extended operational range',
      'Enhanced power systems',
      'Advanced communication arrays',
      'Ideal for multi-agent coordination'
    ],
    draught: [
      'Unlimited operational range',
      'Advanced AI coordination systems',
      'Enterprise security protocols', 
      'Massive multi-agent orchestration'
    ]
  };
  return features[classId as keyof typeof features] || [];
};

const STARSHIP_STATUSES = {
  active: {
    name: 'Active',
    description: 'Currently operational and available for missions',
    color: 'bg-green-500/20 text-green-400 border-green-500/30'
  },
  inactive: {
    name: 'Inactive',
    description: 'Currently not operational',
    color: 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }
};

export function StarshipEditModal({ 
  starshipId, 
  open, 
  onOpenChange, 
  onSuccess 
}: StarshipEditModalProps) {
  const { 
    starships, 
    updateStarship, 
    loadingUpdate, 
    updateError, 
    clearError 
  } = useStarshipStore();

  const [formData, setFormData] = useState<StarshipEditFormData>({
    name: '',
    status: 'inactive',
    class: 'scout'
  });
  const [errors, setErrors] = useState<Partial<StarshipEditFormData>>({});
  const [hasChanges, setHasChanges] = useState(false);
  
  // New state for API-driven data
  const [starshipClasses, setStarshipClasses] = useState<Record<string, any>>({});
  const [classesLoading, setClassesLoading] = useState(true);

  const starship = starships.find(s => s.id === starshipId);

  // Initialize form data when starship is loaded
  useEffect(() => {
    if (starship) {
      const initialData = {
        name: starship.name,
        status: starship.status,
        class: starship.class
      };
      setFormData(initialData);
      setHasChanges(false);
    }
  }, [starship]);

  // Clear errors when modal opens
  useEffect(() => {
    if (open) {
      clearError('update');
      setErrors({});
    }
  }, [open, clearError]);

  // Track changes
  useEffect(() => {
    if (starship) {
      const hasNameChange = formData.name !== starship.name;
      const hasStatusChange = formData.status !== starship.status;
      const hasClassChange = formData.class !== starship.class;
      setHasChanges(hasNameChange || hasStatusChange || hasClassChange);
    }
  }, [formData, starship]);

  // Fetch starship classes from API
  useEffect(() => {
    async function fetchStarshipData() {
      try {
        setClassesLoading(true);
        // Use proxy endpoint that routes to backend
        const response = await fetch('/v1/starships/pricing');
        if (response.ok) {
          const pricingData = await response.json();
          
          // Transform pricing data into starship classes format
          const classesFromAPI = pricingData.reduce((acc: any, plan: any) => {
            acc[plan.id] = {
              name: plan.name,
              icon: getClassIcon(plan.id),
              maxAgents: plan.features.maxAgents,
              description: plan.description,
              features: getClassFeatures(plan.id)
            };
            return acc;
          }, {});
          
          setStarshipClasses(classesFromAPI);
        }
      } catch (error) {
        console.error('Failed to fetch starship data:', error);
        // No fallbacks - subscription feature must work properly
        setStarshipClasses({});
      } finally {
        setClassesLoading(false);
      }
    }
    
    if (open) {
      fetchStarshipData();
    }
  }, [open]);

  const validateForm = (): boolean => {
    const newErrors: any = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Starship name is required';
    } else if (formData.name.length < 3) {
      newErrors.name = 'Name must be at least 3 characters';
    } else if (formData.name.length > 50) {
      newErrors.name = 'Name must be less than 50 characters';
    }


    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm() || !starship) return;

    try {
      const updates: any = {};
      
      if (formData.name !== starship.name) {
        updates.name = formData.name;
      }
      if (formData.status !== starship.status) {
        updates.status = formData.status;
      }
      if (formData.class !== starship.class) {
        updates.class = formData.class;
      }

      await updateStarship(starshipId, updates);
      onSuccess();
    } catch (error) {
      console.error('Failed to update starship:', error);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    if (starship) {
      setFormData({
        name: starship.name,
        status: starship.status,
        class: starship.class
      });
    }
    setErrors({});
    clearError('update');
  };

  if (!starship) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md bg-background/95 backdrop-blur-sm border-border/50">
          <div className="flex items-center justify-center py-8">
            <div className="text-center space-y-2">
              <AlertCircle className="w-8 h-8 text-destructive mx-auto" />
              <p className="text-muted-foreground">Starship not found</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl bg-background/95 backdrop-blur-sm border-border/50">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center space-x-2">
            <Edit3 className="w-6 h-6 text-primary" />
            <span>Edit Starship</span>
          </DialogTitle>
          <DialogDescription>
            Modify your starship&apos;s configuration and status
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Current Starship Preview */}
          <Card className="bg-card/50 backdrop-blur-sm border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center space-x-2">
                <Rocket className="w-5 h-5" />
                <span>Current Configuration</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-3">
                <div className="text-2xl">{starshipClasses[starship.class]?.icon || getClassIcon(starship.class)}</div>
                <div className="flex-1">
                  <div className="font-semibold">{starship.name}</div>
                  <div className="flex items-center space-x-2 mt-1">
                    <Badge variant="outline" className={STARSHIP_STATUSES[starship.status].color}>
                      {starship.status}
                    </Badge>
                    <Badge variant="outline" className="capitalize">
                      {starship.class}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Edit Form */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="starship-name">Starship Name</Label>
              <Input
                id="starship-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={cn(
                  "bg-background/50 backdrop-blur-sm border-border/50",
                  errors.name && "border-destructive"
                )}
                placeholder="Enter starship name..."
              />
              {errors.name && (
                <p className="text-sm text-destructive">{errors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="starship-status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) =>
                  setFormData({ ...formData, status: value as 'active' | 'inactive' })
                }
              >
                <SelectTrigger className="bg-background/50 backdrop-blur-sm border-border/50">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STARSHIP_STATUSES).map(([key, status]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center space-x-2">
                        <div className="flex items-center space-x-2">
                          <div className={cn("w-2 h-2 rounded-full", {
                            "bg-green-500": key === 'active',
                            "bg-blue-500": key === 'docked',
                            "bg-yellow-500": key === 'maintenance'
                          })} />
                          <span>{status.name}</span>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {STARSHIP_STATUSES[formData.status].description}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="starship-class">Class</Label>
{classesLoading ? (
                <div className="flex items-center justify-center py-2">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  <span className="text-sm text-muted-foreground">Loading classes...</span>
                </div>
              ) : (
                <Select
                  value={formData.class}
                  onValueChange={(value) =>
                    setFormData({ ...formData, class: value as 'scout' | 'cruiser' | 'draught' })
                  }
                >
                  <SelectTrigger className="bg-background/50 backdrop-blur-sm border-border/50">
                    <SelectValue placeholder="Select class" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(starshipClasses).map(([key, classData]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center space-x-2">
                          <span>{classData.icon}</span>
                          <span>{classData.name}</span>
                          <span className="text-xs text-muted-foreground">
                            ({classData.maxAgents} agents)
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-xs text-muted-foreground">
                {starshipClasses[formData.class]?.description}
              </p>
            </div>

          </div>

          {/* Preview Changes */}
          {hasChanges && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Card className="bg-primary/5 border-primary/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg text-primary">Preview Changes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center space-x-3">
                    <div className="text-2xl">{starshipClasses[formData.class]?.icon || getClassIcon(formData.class)}</div>
                    <div className="flex-1">
                      <div className="font-semibold">{formData.name}</div>
                      <div className="flex items-center space-x-2 mt-1">
                        <Badge variant="outline" className={STARSHIP_STATUSES[formData.status].color}>
                          {formData.status}
                        </Badge>
                        <Badge variant="outline" className="capitalize">
                          {formData.class}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Error Display */}
          {updateError && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg"
            >
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <span className="text-sm text-destructive">{updateError}</span>
              </div>
            </motion.div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={loadingUpdate || !hasChanges}
            className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
          >
            {loadingUpdate ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Updating...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}