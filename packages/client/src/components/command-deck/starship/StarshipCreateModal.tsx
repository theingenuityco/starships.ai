'use client';

import React, { useState, useEffect } from 'react';
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
  CheckCircle,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useStarshipStore } from '@/store/starship-store';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

interface StarshipCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

interface StarshipFormData {
  name: string;
  class: 'scout' | 'cruiser' | 'draught';
}

interface StarshipFormErrors {
  name?: string;
  class?: string;
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

const getClassStats = (classId: string) => {
  const stats = {
    scout: { speed: 90, agility: 85, capacity: 40, efficiency: 80 },
    cruiser: { speed: 60, agility: 50, capacity: 90, efficiency: 70 },
    draught: { speed: 75, agility: 60, capacity: 100, efficiency: 90 }
  };
  return stats[classId as keyof typeof stats] || { speed: 50, agility: 50, capacity: 50, efficiency: 50 };
};

export function StarshipCreateModal({ open, onOpenChange, onSuccess }: StarshipCreateModalProps) {
  const { createStarship, loading } = useStarshipStore();
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<StarshipFormData>({
    name: '',
    class: 'scout'
  });
  const [errors, setErrors] = useState<StarshipFormErrors>({});
  
  // New state for API-driven data
  const [starshipClasses, setStarshipClasses] = useState<Record<string, any>>({});
  const [classesLoading, setClassesLoading] = useState(true);
  const [pricingData, setPricingData] = useState<any[]>([]);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

  const totalSteps = 3;

  // Combine pricing and class data from API
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
              features: getClassFeatures(plan.id),
              stats: getClassStats(plan.id),
              pricing: {
                monthly: plan.monthly,
                yearly: plan.yearly
              }
            };
            return acc;
          }, {});
          
          setStarshipClasses(classesFromAPI);
          setPricingData(pricingData);
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
    }
    
    if (stepNumber === 2) {
      // Validate billing period for paid plans
      if ((formData.class === 'cruiser' || formData.class === 'draught') && !billingPeriod) {
        newErrors.class = 'Please select a billing period';
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
      if (formData.class === 'scout') {
        // Free starship - use existing logic (with limit check)
        await createStarship(formData);
        onSuccess();
        handleReset();
      } else {
        // Paid starship - redirect to Stripe checkout  
        // Use proxy endpoint that routes to backend
        const response = await api.post('/api/checkout-session', {
          starshipName: formData.name,
          plan: formData.class,
          billingPeriod: billingPeriod
        });
        
        if (response.data.url) {
          window.location.href = response.data.url;
        } else {
          throw new Error('No checkout URL received');
        }
      }
    } catch (error: any) {
      console.error('Failed to create starship:', error);
      
      // Handle specific error cases following codebase patterns
      const errorMessage = error instanceof Error ? error.message : 'Failed to create starship. Please try again.';
      
      if (error.response?.status === 400 && error.response?.data?.error?.includes('limit')) {
        setErrors({ class: error.response.data.error });
      } else if (error.response?.status === 401) {
        // Authentication error - redirect to login
        window.location.href = '/api/auth/login';
      } else {
        // Generic error handling following existing codebase patterns
        setErrors({ class: error.response?.data?.error || errorMessage });
      }
    }
  };

  const handleReset = () => {
    setStep(1);
    setFormData({ name: '', class: 'scout' });
    setErrors({});
    setBillingPeriod('monthly'); // Reset billing period
    // starshipClasses and pricingData persist across resets
  };

  const handleClose = () => {
    onOpenChange(false);
    handleReset();
  };

  const selectedClass = starshipClasses[formData.class] || {
    name: formData.class.charAt(0).toUpperCase() + formData.class.slice(1),
    icon: getClassIcon(formData.class),
    maxAgents: 3,
    description: 'Loading...',
    features: getClassFeatures(formData.class),
    stats: getClassStats(formData.class),
    pricing: { monthly: 0, yearly: 0 }
  };

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
                              Scout Class Starship
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

{classesLoading ? (
                  <div className="text-center py-8">
                    <Loader2 className="w-8 h-8 mx-auto animate-spin text-primary" />
                    <p className="text-muted-foreground mt-2">Loading starship classes...</p>
                  </div>
                ) : Object.keys(starshipClasses).length === 0 ? (
                  <div className="text-center py-8">
                    <AlertTriangle className="w-8 h-8 mx-auto text-destructive" />
                    <p className="text-destructive mt-2">Failed to load starship classes.</p>
                    <p className="text-muted-foreground text-sm">Please refresh the page or contact support.</p>
                    <Button variant="outline" onClick={() => window.location.reload()} className="mt-4">
                      Refresh Page
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(starshipClasses).map(([key, classData]) => (
                      <Card
                        key={key}
                        className={cn(
                          "cursor-pointer transition-all duration-200 bg-card/50 backdrop-blur-sm border-border/50",
                          formData.class === key && "ring-2 ring-primary/50 bg-primary/5"
                        )}
                        onClick={() => setFormData({ ...formData, class: key as 'scout' | 'cruiser' | 'draught' })}
                      >
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <div className="text-2xl">{classData.icon}</div>
                              <div>
                                <CardTitle className="text-lg">{classData.name}</CardTitle>
                                <Badge variant="outline" className="mt-1">
                                  {classData.maxAgents} Agent Slots
                                </Badge>
                              </div>
                            </div>
                            {classData.pricing && classData.pricing.monthly > 0 && (
                              <div className="text-right">
                                <div className="text-sm font-medium">
                                  ${classData.pricing.monthly}/mo
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  ${classData.pricing.yearly}/yr
                                </div>
                              </div>
                            )}
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
                            {classData.features.slice(0, 2).map((feature: string, index: number) => (
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
                )}

                {/* Add billing period UI after class selection */}
                {(formData.class === 'cruiser' || formData.class === 'draught') && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-6"
                  >
                    <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-lg flex items-center space-x-2">
                          <Zap className="w-5 h-5 text-primary" />
                          <span>Billing Period</span>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 gap-3">
                          <Button
                            variant={billingPeriod === 'monthly' ? 'default' : 'outline'}
                            onClick={() => setBillingPeriod('monthly')}
                            className="flex flex-col items-center p-4 h-auto space-y-1"
                          >
                            <span className="font-semibold">Monthly</span>
                            <span className="text-sm text-muted-foreground">
                              ${starshipClasses[formData.class]?.pricing?.monthly || 0}/month
                            </span>
                          </Button>
                          <Button
                            variant={billingPeriod === 'yearly' ? 'default' : 'outline'}
                            onClick={() => setBillingPeriod('yearly')}
                            className="flex flex-col items-center p-4 h-auto space-y-1"
                          >
                            <span className="font-semibold">Yearly</span>
                            <span className="text-sm text-muted-foreground">
                              ${starshipClasses[formData.class]?.pricing?.yearly || 0}/year
                            </span>
                            <Badge variant="secondary" className="text-xs">Save 17%</Badge>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                )}
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
                    {/* Billing Information for Paid Plans */}
                    {(formData.class === 'cruiser' || formData.class === 'draught') && (
                      <div className="bg-primary/5 p-4 rounded-lg border border-primary/20">
                        <h4 className="font-medium text-primary mb-2">Subscription Details</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span>Plan:</span>
                            <span className="font-medium">{selectedClass?.name}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Billing:</span>
                            <span className="font-medium capitalize">{billingPeriod}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>Price:</span>
                            <span className="font-medium">
                              ${selectedClass?.pricing?.[billingPeriod] || 0}
                              /{billingPeriod === 'monthly' ? 'month' : 'year'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Free Plan Information */}
                    {formData.class === 'scout' && (
                      <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                        <h4 className="font-medium text-green-800 mb-2">Free Plan</h4>
                        <p className="text-sm text-green-700">
                          No payment required. Limited to 3 scout starships per account.
                        </p>
                      </div>
                    )}

                    {/* Existing capacity and features sections */}
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <div className="flex items-center space-x-2">
                          <Users className="w-4 h-4 text-blue-500" />
                          <span className="text-sm font-medium">Agent Capacity</span>
                        </div>
                        <div className="text-2xl font-bold">{selectedClass?.maxAgents}</div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <h4 className="font-medium">Key Features</h4>
                      <ul className="space-y-2">
                        {selectedClass?.features?.map((feature: string, index: number) => (
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
                        {Object.entries(selectedClass?.stats || {}).map(([stat, value]) => (
                          <div key={stat} className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="capitalize">{stat}</span>
                              <span>{value}%</span>
                            </div>
                            <Progress value={value as number} className="h-1" />
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