'use client';

import React, { useState } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  ChevronLeft, 
  ChevronRight, 
  Rocket, 
  Users, 
  Zap, 
  Navigation,
  CheckCircle,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useStarshipStore } from '@/store/starship-store';
import { cn } from '@/lib/utils';

interface StarshipCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface StarshipFormData {
  name: string;
  class: 'scout' | 'cruiser';
  maxActiveExpeditions: number;
}

interface StarshipFormErrors {
  name?: string;
  class?: string;
  maxActiveExpeditions?: string;
}

const STARSHIP_CLASSES = {
  scout: {
    name: 'Scout',
    icon: '🚀',
    maxAgents: 3,
    description: 'Fast and agile, perfect for exploration and reconnaissance missions.',
    features: [
      'Rapid deployment capabilities',
      'Advanced scanning equipment',
      'Stealth technology',
      'Optimal for single-agent operations'
    ],
    stats: {
      speed: 90,
      agility: 85,
      capacity: 40,
      efficiency: 80
    }
  },
  cruiser: {
    name: 'Cruiser',
    icon: '🛸',
    maxAgents: 6,
    description: 'Heavy-duty vessel designed for extended missions and team operations.',
    features: [
      'Extended operational range',
      'Enhanced power systems',
      'Advanced communication arrays',
      'Ideal for multi-agent coordination'
    ],
    stats: {
      speed: 60,
      agility: 50,
      capacity: 90,
      efficiency: 70
    }
  }
};

export function StarshipCreateModal({ open, onOpenChange, onSuccess }: StarshipCreateModalProps) {
  const { createStarship, loading } = useStarshipStore();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<StarshipFormData>({
    name: '',
    class: 'scout',
    maxActiveExpeditions: 3
  });
  const [errors, setErrors] = useState<StarshipFormErrors>({});

  const totalSteps = 3;

  const validateStep = (stepNumber: number): boolean => {
    const newErrors: StarshipFormErrors = {};
    
    if (stepNumber === 1) {
      if (!formData.name.trim()) {
        newErrors.name = 'Starship name is required';
      } else if (formData.name.length < 3) {
        newErrors.name = 'Name must be at least 3 characters';
      } else if (formData.name.length > 50) {
        newErrors.name = 'Name must be less than 50 characters';
      }

      if (formData.maxActiveExpeditions < 1) {
        newErrors.maxActiveExpeditions = 'Must be at least 1';
      } else if (formData.maxActiveExpeditions > 50) {
        newErrors.maxActiveExpeditions = 'Must be 50 or less';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep(step + 1);
    }
  };

  const handlePrevious = () => {
    setStep(step - 1);
    setErrors({});
  };

  const handleSubmit = async () => {
    if (!validateStep(step)) return;

    try {
      await createStarship(formData);
      onSuccess();
      handleReset();
    } catch (error) {
      console.error('Failed to create starship:', error);
    }
  };

  const handleReset = () => {
    setStep(1);
    setFormData({ name: '', class: 'scout', maxActiveExpeditions: 3 });
    setErrors({});
  };

  const handleClose = () => {
    onOpenChange(false);
    handleReset();
  };

  const selectedClass = STARSHIP_CLASSES[formData.class];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl bg-background/95 backdrop-blur-sm border-border/50">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
            Create New Starship
          </DialogTitle>
          <DialogDescription>
            Configure your starship for galactic exploration and agent deployment
          </DialogDescription>
        </DialogHeader>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Step {step} of {totalSteps}</span>
            <span>{Math.round((step / totalSteps) * 100)}% Complete</span>
          </div>
          <Progress value={(step / totalSteps) * 100} className="h-2" />
        </div>

        <div className="min-h-[400px]">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="text-center space-y-2">
                  <Rocket className="w-12 h-12 mx-auto text-primary" />
                  <h3 className="text-xl font-semibold">Name Your Starship</h3>
                  <p className="text-muted-foreground">
                    Choose a memorable name for your vessel
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="starship-name">Starship Name</Label>
                    <Input
                      id="starship-name"
                      placeholder="Enter starship name..."
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className={cn(
                        "bg-background/50 backdrop-blur-sm border-border/50",
                        errors.name && "border-destructive"
                      )}
                    />
                    {errors.name && (
                      <p className="text-sm text-destructive">{errors.name}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="max-expeditions">Max Active Expeditions</Label>
                    <Input
                      id="max-expeditions"
                      type="number"
                      min="1"
                      max="50"
                      placeholder="3"
                      value={formData.maxActiveExpeditions}
                      onChange={(e) => setFormData({ ...formData, maxActiveExpeditions: parseInt(e.target.value) || 1 })}
                      className={cn(
                        "bg-background/50 backdrop-blur-sm border-border/50",
                        errors.maxActiveExpeditions && "border-destructive"
                      )}
                    />
                    {errors.maxActiveExpeditions && (
                      <p className="text-sm text-destructive">{errors.maxActiveExpeditions}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Maximum number of active expeditions this starship can run simultaneously
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Preview</Label>
                    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                      <CardContent className="p-4">
                        <div className="flex items-center space-x-3">
                          <div className="text-2xl">🚀</div>
                          <div>
                            <div className="font-medium">
                              {formData.name || 'Unnamed Starship'}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              Scout Class • Max {formData.maxActiveExpeditions} Expeditions
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="text-center space-y-2">
                  <Users className="w-12 h-12 mx-auto text-primary" />
                  <h3 className="text-xl font-semibold">Select Starship Class</h3>
                  <p className="text-muted-foreground">
                    Choose the class that best fits your mission requirements
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(STARSHIP_CLASSES).map(([key, classData]) => (
                    <Card
                      key={key}
                      className={cn(
                        "cursor-pointer transition-all duration-200 bg-card/50 backdrop-blur-sm border-border/50",
                        formData.class === key && "ring-2 ring-primary/50 bg-primary/5"
                      )}
                      onClick={() => setFormData({ ...formData, class: key as 'scout' | 'cruiser' })}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-center space-x-3">
                          <div className="text-2xl">{classData.icon}</div>
                          <div>
                            <CardTitle className="text-lg">{classData.name}</CardTitle>
                            <Badge variant="outline" className="mt-1">
                              {classData.maxAgents} Agent Slots
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                          {classData.description}
                        </p>
                        
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Speed</span>
                            <span>{classData.stats.speed}%</span>
                          </div>
                          <Progress value={classData.stats.speed} className="h-1" />
                        </div>

                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Capacity</span>
                            <span>{classData.stats.capacity}%</span>
                          </div>
                          <Progress value={classData.stats.capacity} className="h-1" />
                        </div>

                        <ul className="space-y-1">
                          {classData.features.slice(0, 2).map((feature, index) => (
                            <li key={index} className="flex items-center space-x-2 text-xs">
                              <CheckCircle className="w-3 h-3 text-green-500" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="text-center space-y-2">
                  <CheckCircle className="w-12 h-12 mx-auto text-green-500" />
                  <h3 className="text-xl font-semibold">Review & Create</h3>
                  <p className="text-muted-foreground">
                    Review your starship configuration before creation
                  </p>
                </div>

                <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-3">
                      <div className="text-2xl">{selectedClass.icon}</div>
                      <div>
                        <div className="text-xl">{formData.name}</div>
                        <div className="text-sm text-muted-foreground font-normal">
                          {selectedClass.name} Class Starship
                        </div>
                      </div>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <Users className="w-4 h-4 text-blue-500" />
                          <span className="text-sm font-medium">Agent Capacity</span>
                        </div>
                        <div className="text-2xl font-bold">{selectedClass.maxAgents}</div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <Navigation className="w-4 h-4 text-green-500" />
                          <span className="text-sm font-medium">Max Expeditions</span>
                        </div>
                        <div className="text-2xl font-bold">{formData.maxActiveExpeditions}</div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="font-medium">Key Features</h4>
                      <ul className="space-y-2">
                        {selectedClass.features.map((feature, index) => (
                          <li key={index} className="flex items-center space-x-2 text-sm">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            <span>{feature}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="space-y-3">
                      <h4 className="font-medium">Performance Profile</h4>
                      <div className="grid grid-cols-2 gap-4">
                        {Object.entries(selectedClass.stats).map(([stat, value]) => (
                          <div key={stat} className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="capitalize">{stat}</span>
                              <span>{value}%</span>
                            </div>
                            <Progress value={value} className="h-1" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation Buttons */}
        <div className="flex justify-between pt-4 border-t border-border/50">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={step === 1}
            className="flex items-center space-x-2"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous</span>
          </Button>

          <div className="flex space-x-2">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            {step < totalSteps ? (
              <Button onClick={handleNext} className="flex items-center space-x-2">
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={loading}
                className="flex items-center space-x-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <Rocket className="w-4 h-4" />
                    <span>Create Starship</span>
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}