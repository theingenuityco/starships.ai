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
import { Progress } from '@/components/ui/progress';
import {
  ChevronLeft,
  ChevronRight,
  Rocket,
  Users,
  Check,
  CheckCircle,
  Loader2,
  AlertCircle,
  Bot
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import api, { starshipAPI } from '@/lib/api';
import { useCreateStarship, useStarships } from '@/hooks/useStarships';

interface StarshipCreateModalUnifiedProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  isOnboarding?: boolean;
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

export function StarshipCreateModalUnified({
  open,
  onOpenChange,
  onSuccess,
  isOnboarding = false
}: StarshipCreateModalUnifiedProps) {
  const { data: starshipsData } = useStarships();
  const starships = starshipsData?.starships || [];
  const createStarshipMutation = useCreateStarship();
  const router = useRouter();
  const [showExitConfirmation, setShowExitConfirmation] = useState(false);
  const [creatingPaidStarship, setCreatingPaidStarship] = useState(false);
  
  // New state for API-driven pricing data
  const [starshipClasses, setStarshipClasses] = useState<Record<string, any>>({});
  const [classesLoading, setClassesLoading] = useState(true);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  
  // Now only 2 steps: Name, Class
  const totalSteps = 2;
  
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<StarshipFormData>({
    name: '',
    class: 'cruiser'
  });
  const [errors, setErrors] = useState<StarshipFormErrors>({});


  // Combine pricing and class data from API
  useEffect(() => {
    async function fetchStarshipData() {
      try {
        setClassesLoading(true);
        // Use proxy endpoint that routes to backend
        const response = await fetch('/api/pricing');
        if (response.ok) {
          const pricingData = await response.json();
          
          // Transform pricing data into starship classes format
          // Temporarily filter out draught plan
          const classesFromAPI = pricingData
            .filter((plan: any) => plan.id !== 'draught') // Comment out draught for now
            .reduce((acc: any, plan: any) => {
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
    
    // Name step validation
    if (stepNumber === 1) {
      if (!formData.name.trim()) {
        newErrors.name = 'Starship name is required';
      } else if (formData.name.length < 3) {
        newErrors.name = 'Name must be at least 3 characters';
      } else if (formData.name.length > 50) {
        newErrors.name = 'Name must be less than 50 characters';
      }
    }
    
    // Class step validation
    if (stepNumber === 2) {
      // Validate billing period for paid plans
      if ((formData.class === 'cruiser' || formData.class === 'draught') && !billingPeriod) {
        newErrors.class = 'Please select a billing period';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = async () => {
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
        // Check Scout limit (max 3 starships)
        const scoutStarships = starships?.filter((s: any) => s.class === 'scout') || [];
        if (scoutStarships.length >= 3) {
          toast.error('Scout plan limit reached', {
            description: 'You can only create up to 3 Scout starships. Please upgrade to Cruiser or Draught plan for more starships.',
            duration: 5000,
          });
          return;
        }
        
        // Free starship - use existing logic
        const starshipData: any = {
          name: formData.name,
          class: formData.class
        };
        
        const response = await createStarshipMutation.mutateAsync(starshipData);
        const newStarship = response.starship;
        
        
        onSuccess();
        handleReset();
        
        // Navigate to the new starship's command deck
        if (newStarship && typeof newStarship === 'object' && 'slug' in newStarship) {
          router.push(`/ship/${newStarship.slug}/command-deck`);
        }
      } else {
        // Paid starship - create starship first, then redirect to Stripe checkout
        // Use new create-paid endpoint that creates starship with pending_payment status
        setCreatingPaidStarship(true);
        
        try {
          console.log('[STARSHIP-CREATE] Creating paid starship:', {
            name: formData.name,
            plan: formData.class,
            billingPeriod: billingPeriod
          });
          
          const response = await starshipAPI.createPaidStarship({
            name: formData.name,
            plan: formData.class as 'cruiser' | 'draught',
            billingPeriod: billingPeriod
          });
          
          console.log('[STARSHIP-CREATE] Received response:', response);
          
          const checkoutUrl = (response as any).data.checkoutUrl;
          
          if (checkoutUrl) {
            console.log('[STARSHIP-CREATE] Redirecting to checkout:', checkoutUrl);
            // Keep loading state while redirecting to Stripe
            window.location.href = checkoutUrl;
          } else {
            console.error('[STARSHIP-CREATE] No checkout URL in response:', response);
            throw new Error(`No checkout URL received. Response: ${JSON.stringify(response)}`);
          }
        } catch (error) {
          console.error('[STARSHIP-CREATE] Error creating paid starship:', error);
          setCreatingPaidStarship(false);
          throw error;
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
    setFormData({
      name: '',
      class: 'cruiser'
    });
    setErrors({});
    setBillingPeriod('monthly'); // Reset billing period
    // starshipClasses and pricingData persist across resets
  };

  const handleClose = () => {
    onOpenChange(false);
    handleReset();
  };

  const renderStepContent = () => {
    // Step 1: Name Input
    if (step === 1) {
      return (
        <motion.div
          key="step1"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="space-y-6"
        >
          <div className="text-center">
            <div className="flex items-center justify-center gap-3">
              <Rocket className="w-10 h-10 text-primary" />
              <h3 className="text-xl font-semibold">Starship Name</h3>
            </div>
          </div>

          <div className="space-y-5 px-1">
            {/* Starship Name Input (Required) */}
            <div className="space-y-2">
              <Label htmlFor="starship-name" className="flex items-center gap-2">
                <Rocket className="w-4 h-4" />
                Starship Name
                <span className="text-xs text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="starship-name"
                  placeholder="Enter a memorable name for your starship."
                  value={formData.name}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFormData({ ...formData, name: e.target.value })}
                  className={cn(
                    "pr-10 bg-background/50 backdrop-blur-sm border border-border/50",
                    "focus:border-primary focus:ring-0 focus:ring-offset-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
                    errors.name && "border-destructive focus:border-destructive"
                  )}
                  tabIndex={1}
                />
                {formData.name && !errors.name && (
                  <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
                )}
              </div>
              {errors.name && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.name}
                </p>
              )}
            </div>

            {/* Preview Card */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Preview</Label>
              <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3">
                    <div className="text-2xl">{getClassIcon(formData.class)}</div>
                    <div className="flex-1">
                      <div className="font-medium">
                        {formData.name || '________'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {starshipClasses[formData.class]?.name || formData.class.charAt(0).toUpperCase() + formData.class.slice(1)} Class Starship
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </motion.div>
      );
    }

    // Step 2: Class Selection
    if (step === 2) {
      return (
        <motion.div
          key="step2"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="space-y-6 overflow-visible"
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
              <AlertCircle className="w-8 h-8 mx-auto text-destructive" />
              <p className="text-destructive mt-2">Failed to load starship classes.</p>
              <p className="text-muted-foreground text-sm">Please refresh the page or contact support.</p>
              <Button variant="outline" onClick={() => window.location.reload()} className="mt-4">
                Refresh Page
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Modern Billing Toggle with Animation */}
              {Object.values(starshipClasses).some((c: any) => c.pricing?.monthly > 0) && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center gap-2"
                >
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">Billing Period</span>
                  <div className="relative bg-gradient-to-r from-muted/20 to-muted/30 backdrop-blur-xl rounded-full p-0.5 shadow-inner">
                    <div className="relative flex items-center">
                      {/* Sliding Background */}
                      <motion.div
                        className="absolute h-full bg-gradient-to-r from-primary to-primary/80 rounded-full shadow-lg"
                        initial={false}
                        animate={{
                          x: billingPeriod === 'monthly' ? 0 : '100%',
                          width: billingPeriod === 'monthly' ? '50%' : '50%',
                        }}
                        transition={{ type: "spring", stiffness: 300, damping: 30 }}
                      />
                      
                      {/* Monthly Option */}
                      <button
                        onClick={() => setBillingPeriod('monthly')}
                        className={cn(
                          "relative z-10 px-8 py-2.5 rounded-full text-sm font-semibold transition-colors duration-200",
                          billingPeriod === 'monthly' 
                            ? "text-primary-foreground" 
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        Monthly
                      </button>
                      
                      {/* Yearly Option */}
                      <button
                        onClick={() => setBillingPeriod('yearly')}
                        className={cn(
                          "relative z-10 px-8 py-2.5 rounded-full text-sm font-semibold transition-colors duration-200",
                          billingPeriod === 'yearly' 
                            ? "text-primary-foreground" 
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        Yearly
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Modern Card Grid with padding for badges */}
              <div className="grid grid-cols-1 gap-4 px-1 py-3">
                {Object.entries(starshipClasses).map(([key, classData], index) => {
                  const scoutStarships = starships?.filter((s: any) => s.class === 'scout') || [];
                  const isScoutLimitReached = key === 'scout' && scoutStarships.length >= 3;
                  const isSelected = formData.class === key;
                  const isPaid = classData.pricing?.monthly > 0;
                  const displayPrice = billingPeriod === 'monthly' ? classData.pricing?.monthly : classData.pricing?.yearly;
                  
                  return (
                    <motion.div
                      key={key}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="px-2"
                    >
                      <div
                        className={cn(
                          "relative group cursor-pointer",
                          isScoutLimitReached && "pointer-events-none"
                        )}
                        onClick={() => {
                          if (isScoutLimitReached) {
                            toast.error('Scout limit reached', {
                              description: 'You already have 3 Scout starships. Upgrade to Cruiser for more.',
                            });
                            return;
                          }
                          setFormData({ ...formData, class: key as 'scout' | 'cruiser' | 'draught' })
                        }}
                      >
                        {/* Background Glow Effect */}
                        <div className={cn(
                          "absolute inset-0 rounded-2xl transition-all duration-500",
                          isSelected && "bg-gradient-to-r from-primary/20 via-primary/10 to-primary/20 blur-xl"
                        )} />
                        
                        {/* Main Card */}
                        <div className={cn(
                          "relative rounded-2xl border transition-all duration-300",
                          isSelected 
                            ? "border-primary bg-gradient-to-br from-card via-background to-card shadow-2xl" 
                            : "border-border/60 bg-card/40 hover:border-border hover:bg-card/60 hover:shadow-xl",
                          isScoutLimitReached && "opacity-50"
                        )}>

                          {/* Selection Checkmark */}
                          <AnimatePresence>
                            {isSelected && (
                              <motion.div
                                initial={{ scale: 0, rotate: -180 }}
                                animate={{ scale: 1, rotate: 0 }}
                                exit={{ scale: 0, rotate: 180 }}
                                className="absolute -top-2 -right-2 z-10"
                              >
                                <div className="relative">
                                  <div className="absolute inset-0 bg-primary blur-md" />
                                  <div className="relative bg-primary rounded-full p-1.5 shadow-lg">
                                    <Check className="w-4 h-4 text-primary-foreground" />
                                  </div>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          <div className="p-6">
                            <div className="flex items-start justify-between mb-4">
                              {/* Left: Icon and Title */}
                              <div className="flex items-start gap-4">
                                <motion.div
                                  whileHover={{ rotate: 5 }}
                                  className={cn(
                                    "relative p-3 rounded-xl transition-all duration-300",
                                    isSelected 
                                      ? "bg-gradient-to-br from-primary/20 to-primary/10 shadow-lg shadow-primary/20" 
                                      : "bg-gradient-to-br from-muted/80 to-muted/40"
                                  )}
                                >
                                  <span className="text-2xl">{classData.icon}</span>
                                </motion.div>
                                
                                <div>
                                  <h3 className="text-xl font-bold mb-1">{classData.name}</h3>
                                  <p className="text-sm text-muted-foreground">{classData.description}</p>
                                  
                                  {/* Agent Slots */}
                                  <div className="flex items-center gap-2 mt-3">
                                    <Bot className={cn(
                                      "w-4 h-4",
                                      isSelected ? "text-primary" : "text-muted-foreground"
                                    )} />
                                    <span className="text-sm font-medium">
                                      {classData.maxAgents} Agent Slots
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Right: Price */}
                              <div className="text-right">
                                {isPaid ? (
                                  <div>
                                    <div className="flex items-baseline gap-1">
                                      <span className="text-3xl font-bold tracking-tight">
                                        ${displayPrice}
                                      </span>
                                    </div>
                                    <span className="text-xs text-muted-foreground">
                                      per {billingPeriod === 'monthly' ? 'month' : 'year'}
                                    </span>
                                  </div>
                                ) : (
                                  <div>
                                    <span className="text-2xl font-bold text-green-500">Free</span>
                                    {key === 'scout' && (
                                      <div className="text-xs text-muted-foreground mt-1">
                                        {scoutStarships.length}/3 used
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Features */}
                            <div className="space-y-2 mt-4 pt-4 border-t border-border/50">
                              {classData.features.slice(0, 2).map((feature: string, idx: number) => (
                                <motion.div
                                  key={idx}
                                  initial={{ opacity: 0, x: -10 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: index * 0.1 + idx * 0.05 }}
                                  className="flex items-center gap-2 text-sm"
                                >
                                  <div className={cn(
                                    "w-1.5 h-1.5 rounded-full",
                                    isSelected ? "bg-primary" : "bg-muted-foreground/50"
                                  )} />
                                  <span className={cn(
                                    isSelected ? "text-foreground" : "text-muted-foreground"
                                  )}>
                                    {feature}
                                  </span>
                                </motion.div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}
        </motion.div>
      );
    }


    return null;
  };


  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-2xl overflow-visible">
          <div className="max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Create New Starship
            </DialogTitle>
          </DialogHeader>

          {/* Progress Bar */}
          <div className="space-y-2 flex-shrink-0">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Step {step} of {totalSteps}</span>
              <span>{Math.round((step / totalSteps) * 100)}% Complete</span>
            </div>
            <Progress value={(step / totalSteps) * 100} className="h-2" />
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 py-4">
            <AnimatePresence mode="wait">
              {renderStepContent()}
            </AnimatePresence>
          </div>

          {/* Navigation Buttons */}
          <div className="flex justify-between pt-4 border-t border-border/50 flex-shrink-0">
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
                <Button
                  onClick={handleNext}
                  disabled={step === 1 && !formData.name.trim()}
                  className="flex items-center space-x-2"
                >
                  <span>Next</span>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={createStarshipMutation.isPending || creatingPaidStarship}
                  className="flex items-center space-x-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                >
                  {(createStarshipMutation.isPending || creatingPaidStarship) ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{creatingPaidStarship ? 'Preparing checkout...' : 'Creating...'}</span>
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
          
          {/* Loading Overlay for Paid Starship Creation */}
          {creatingPaidStarship && (
            <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 rounded-lg">
              <div className="flex flex-col items-center space-y-4">
                <Loader2 className="w-12 h-12 animate-spin text-primary" />
                <div className="text-center space-y-2">
                  <p className="text-lg font-semibold">Preparing your starship...</p>
                  <p className="text-sm text-muted-foreground">Redirecting to secure checkout</p>
                </div>
              </div>
            </div>
          )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Exit Confirmation Dialog */}
      <Dialog open={showExitConfirmation} onOpenChange={setShowExitConfirmation}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Are you sure you want to exit?</DialogTitle>
            <DialogDescription>
              You can continue creating your starship later from your fleet page.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="outline" onClick={() => setShowExitConfirmation(false)}>
              Continue Creating
            </Button>
            <Button onClick={() => {
              setShowExitConfirmation(false);
              onOpenChange(false);
            }}>
              Exit
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}