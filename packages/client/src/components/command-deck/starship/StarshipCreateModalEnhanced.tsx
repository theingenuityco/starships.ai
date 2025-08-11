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
  Navigation,
  CheckCircle,
  Loader2,
  Eye,
  Sparkles,
  AlertCircle,
  ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useStarshipStore } from '@/store/starship-store';
import api from '@/lib/api';
import { useOnboardingSession } from '@/hooks/useOnboardingSession';
import { VisionReviewStep } from '@/components/vision/VisionReviewStep';
import { cn } from '@/lib/utils';

interface StarshipCreateModalEnhancedProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  isOnboarding?: boolean;
}

interface StarshipFormData {
  name: string;
  class: 'scout' | 'cruiser' | 'draught';
  vision?: string;
}

interface StarshipFormErrors {
  name?: string;
  class?: string;
  vision?: string;
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

export function StarshipCreateModalEnhanced({ 
  open, 
  onOpenChange, 
  onSuccess,
  isOnboarding = false 
}: StarshipCreateModalEnhancedProps) {
  const { createStarship, loading } = useStarshipStore();
  const { session: hookSession, clearSession, updateStep } = useOnboardingSession();
  const [showExitConfirmation, setShowExitConfirmation] = useState(false);
  
  // Try to get session from hook or fallback to localStorage
  let session = hookSession;
  if (isOnboarding && !session) {
    try {
      const stored = localStorage.getItem('onboarding_session');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.data) {
          session = parsed.data;
          console.log('[CreateModal] Using localStorage fallback for session');
        }
      }
    } catch (e) {
      console.error('[CreateModal] Failed to get localStorage fallback:', e);
    }
  }
  
  // Determine if we have a vision from onboarding
  const hasVision = isOnboarding && session?.pendingVision;
  const totalSteps = hasVision ? 4 : 3;
  
  const [step, setStep] = useState(hasVision ? 1 : 2); // Start at vision step if we have one
  const [formData, setFormData] = useState<StarshipFormData>({
    name: session?.visionAnalysis?.suggestedName || '',
    class: session?.visionAnalysis?.recommendedClass || 'cruiser', // Always default to cruiser
    vision: session?.pendingVision || ''
  });
  const [errors, setErrors] = useState<StarshipFormErrors>({});
  
  // New state for API-driven data
  const [starshipClasses, setStarshipClasses] = useState<Record<string, any>>({});
  const [classesLoading, setClassesLoading] = useState(true);
  const [pricingData, setPricingData] = useState<any[]>([]);
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');

  // Update form data if session changes
  useEffect(() => {
    console.log('[CreateModal] Session check:', { 
      hasSession: !!session, 
      hasPendingVision: !!session?.pendingVision,
      isOnboarding,
      vision: session?.pendingVision?.slice(0, 50)
    });
    
    if (session?.pendingVision && isOnboarding) {
      console.log('[CreateModal] Populating form with vision:', session.pendingVision?.slice(0, 50));
      setFormData(prev => ({
        ...prev,
        vision: session.pendingVision || '',
        name: session.visionAnalysis?.suggestedName || prev.name,
        class: session.visionAnalysis?.recommendedClass || prev.class
      }));
    }
  }, [session, isOnboarding]);

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
    
    // Vision step validation (if present)
    if (hasVision && stepNumber === 1) {
      if (!formData.vision?.trim()) {
        newErrors.vision = 'Vision is required';
      }
    }
    
    // Name step validation
    const nameStepNumber = hasVision ? 2 : 1;
    if (stepNumber === nameStepNumber) {
      if (!formData.name.trim()) {
        newErrors.name = 'Starship name is required';
      } else if (formData.name.length < 3) {
        newErrors.name = 'Name must be at least 3 characters';
      } else if (formData.name.length > 50) {
        newErrors.name = 'Name must be less than 50 characters';
      }
    }
    
    // Class step validation
    const classStepNumber = hasVision ? 3 : 2;
    if (stepNumber === classStepNumber) {
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

  const handleVisionConfirm = (vision: string) => {
    setFormData(prev => ({ ...prev, vision }));
    handleNext();
  };

  const handleVisionSkip = () => {
    setFormData(prev => ({ ...prev, vision: '' }));
    setStep(2); // Skip to name step
  };

  const handleSubmit = async () => {
    if (!validateStep(step)) return;

    try {
      if (formData.class === 'scout') {
        // Free starship - use existing logic with vision if available
        const starshipData: any = {
          name: formData.name,
          class: formData.class
        };
        
        if (formData.vision) {
          starshipData.vision = {
            statement: formData.vision,
            confidence: session?.visionAnalysis?.confidence || 0.8,
            sibilSessionId: session?.sibilSessionId
          };
        }
        
        await createStarship(starshipData);
        
        // Clear onboarding session if we're in onboarding flow
        if (isOnboarding) {
          updateStep('complete');
          setTimeout(() => clearSession(), 1000); // Clear after a short delay
        }
        
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
    setStep(hasVision ? 1 : 2);
    setFormData({
      name: '',
      class: 'cruiser', // Always default to cruiser
      vision: ''
    });
    setErrors({});
    setBillingPeriod('monthly'); // Reset billing period
  };

  const renderStepContent = () => {
    // Vision Step (only if we have vision from onboarding)
    if (hasVision && step === 1) {
      return (
        <VisionReviewStep
          initialVision={formData.vision || session?.pendingVision || ''}
          analysis={session?.visionAnalysis}
          onConfirm={handleVisionConfirm}
          onSkip={handleVisionSkip}
          allowSkip={false} // Don't allow skipping in onboarding
        />
      );
    }

    // Name Step
    const nameStepNumber = hasVision ? 2 : 1;
    if (step === nameStepNumber) {
      return (
        <div className="space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Rocket className="w-5 h-5 text-primary" />
              <Label htmlFor="name" className="text-lg font-semibold">
                Starship Name
              </Label>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              Choose a unique name for your starship
            </p>
            
            <div className="relative">
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter starship name..."
                className={cn(
                  "h-12 text-base px-4",
                  "bg-background/50 border-2 transition-all",
                  "focus:bg-background focus:border-primary/50",
                  errors.name && "border-destructive focus:border-destructive"
                )}
                autoFocus
              />
              {formData.name && !errors.name && (
                <CheckCircle className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-green-500" />
              )}
            </div>
            
            {errors.name && (
              <div className="flex items-center gap-2 mt-2">
                <AlertCircle className="w-4 h-4 text-destructive" />
                <p className="text-sm text-destructive">{errors.name}</p>
              </div>
            )}
            
            {session?.visionAnalysis?.suggestedName && 
             formData.name !== session.visionAnalysis.suggestedName && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 p-3 bg-primary/5 rounded-lg border border-primary/20"
              >
                <div className="flex items-start gap-3">
                  <Sparkles className="w-4 h-4 text-primary mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs text-primary font-medium uppercase tracking-wider mb-1">AI Suggestion</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="p-0 h-auto font-medium text-foreground hover:text-primary hover:bg-transparent"
                      onClick={() => setFormData({ 
                        ...formData, 
                        name: session.visionAnalysis?.suggestedName || '' 
                      })}
                    >
                      Use "{session.visionAnalysis.suggestedName}"
                      <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </div>
                </div>
              </motion.div>
            )}
          </div>
          
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">
              <strong>Tip:</strong> Choose a memorable name that reflects your vision. Consider names from mythology, 
              astronomy, or words that embody your mission's spirit.
            </p>
          </div>
        </div>
      );
    }

    // Class Selection Step
    const classStepNumber = hasVision ? 3 : 2;
    if (step === classStepNumber) {
      return (
        <div className="space-y-6">
          <div>
            <Label className="text-base font-medium">Select Class</Label>
            <p className="text-sm text-muted-foreground mt-1">
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
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(starshipClasses).map(([key, shipClass]) => {
                // Only show Cruiser as recommended, never Scout
                const isRecommended = key === 'cruiser' && session?.visionAnalysis?.recommendedClass;
                
                return (
                  <div
                    key={key}
                    className={cn(
                      "relative p-4 rounded-lg border cursor-pointer transition-all",
                      "hover:border-primary/50 hover:bg-muted/30",
                      formData.class === key ? "border-primary bg-primary/5" : "border-border"
                    )}
                    onClick={() => setFormData({ ...formData, class: key as 'scout' | 'cruiser' | 'draught' })}
                  >
                  {/* Only show recommended badge for Cruiser */}
                  {isRecommended && (
                    <Badge 
                      variant="secondary" 
                      className="absolute top-3 right-3"
                    >
                      <Sparkles className="w-3 h-3 mr-1" />
                      Recommended
                    </Badge>
                  )}
                  
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{shipClass.icon}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold">{shipClass.name} Class</h3>
                          {formData.class === key && (
                            <CheckCircle className="w-4 h-4 text-primary" />
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <p className="text-sm text-muted-foreground">
                      {shipClass.description}
                    </p>
                    
                    <div className="flex flex-wrap gap-3 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>Max {shipClass.maxAgents} agents</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">Speed</span>
                        <div className="w-12 bg-muted rounded-full h-1.5">
                          <div 
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${shipClass.stats.speed}%` }}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-muted-foreground">Capacity</span>
                        <div className="w-12 bg-muted rounded-full h-1.5">
                          <div 
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${shipClass.stats.capacity}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    
                    <div className="pt-2 border-t border-border/50 space-y-1">
                      {shipClass.features.slice(0, 2).map((feature, index) => (
                        <p key={index} className="text-xs text-muted-foreground">
                          • {feature}
                        </p>
                      ))}
                    </div>
                    
                    {/* Pricing information for paid plans */}
                    {shipClass.pricing && shipClass.pricing.monthly > 0 && (
                      <div className="pt-2 border-t border-border/50">
                        <div className="text-xs text-muted-foreground">
                          ${shipClass.pricing.monthly}/mo • ${shipClass.pricing.yearly}/yr
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          )}
          
          {/* Billing period UI for paid plans */}
          {(formData.class === 'cruiser' || formData.class === 'draught') && (
            <div className="space-y-4">
              <div>
                <Label className="text-base font-medium">Billing Period</Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Choose your preferred billing frequency
                </p>
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                <div
                  className={cn(
                    "p-4 rounded-lg border cursor-pointer transition-all text-center",
                    "hover:border-primary/50 hover:bg-muted/30",
                    billingPeriod === 'monthly' ? "border-primary bg-primary/5" : "border-border"
                  )}
                  onClick={() => setBillingPeriod('monthly')}
                >
                  <div className="space-y-2">
                    <div className="font-semibold">Monthly</div>
                    <div className="text-sm text-muted-foreground">
                      ${starshipClasses[formData.class]?.pricing?.monthly || 0}/month
                    </div>
                  </div>
                </div>
                <div
                  className={cn(
                    "p-4 rounded-lg border cursor-pointer transition-all text-center",
                    "hover:border-primary/50 hover:bg-muted/30",
                    billingPeriod === 'yearly' ? "border-primary bg-primary/5" : "border-border"
                  )}
                  onClick={() => setBillingPeriod('yearly')}
                >
                  <div className="space-y-2">
                    <div className="font-semibold">Yearly</div>
                    <div className="text-sm text-muted-foreground">
                      ${starshipClasses[formData.class]?.pricing?.yearly || 0}/year
                    </div>
                    <Badge variant="secondary" className="text-xs">Save 17%</Badge>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">
              <strong>Tip:</strong> Cruiser class is recommended for most projects as it provides 
              the best balance of capabilities and room for growth.
            </p>
          </div>
        </div>
      );
    }

    // Review Step
    const reviewStepNumber = hasVision ? 4 : 3;
    if (step === reviewStepNumber) {
      const selectedClass = starshipClasses[formData.class];
      return (
        <div className="space-y-5">
          <div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-primary" />
              <Label className="text-lg font-semibold">Review & Create</Label>
            </div>
          </div>
          
          <div className="p-4 bg-green-500/10 rounded-lg border border-green-500/20">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <p className="text-sm">
                <strong className="text-foreground">Ready to launch!</strong> Your starship will be created with the configuration above.
              </p>
            </div>
          </div>
          
          <div className="space-y-3">
            {formData.vision && (
              <div className="p-4 bg-background/50 rounded-lg border-2 border-border">
                <div className="flex items-start gap-3">
                  <Eye className="w-4 h-4 text-primary mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Vision Statement</p>
                    <p className="text-sm italic">"{formData.vision}"</p>
                  </div>
                </div>
              </div>
            )}
            
            <div className="p-4 bg-background/50 rounded-lg border-2 border-border">
              <div className="flex items-start gap-3">
                <Rocket className="w-4 h-4 text-primary mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Starship Name</p>
                  <p className="text-base font-semibold">{formData.name}</p>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-background/50 rounded-lg border-2 border-border">
              <div className="flex items-start gap-3">
                <Navigation className="w-4 h-4 text-primary mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Class Configuration</p>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl">{selectedClass.icon}</span>
                      <span className="font-semibold">{selectedClass.name} Class</span>
                    </div>
                    <Badge variant="secondary">
                      <Users className="w-3 h-3 mr-1" />
                      Max {selectedClass.maxAgents} agents
                    </Badge>
                  </div>
                  <div className="space-y-1.5 pt-3 border-t border-border/50">
                    {selectedClass.features.slice(0, 3).map((feature, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <div className="w-1 h-1 rounded-full bg-primary mt-1.5" />
                        <p className="text-xs text-muted-foreground">{feature}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Billing Information for Paid Plans */}
            {(formData.class === 'cruiser' || formData.class === 'draught') && (
              <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
                <div className="flex items-start gap-3">
                  <Zap className="w-4 h-4 text-primary mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Subscription Details</p>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span>Plan:</span>
                        <span className="font-medium">{selectedClass.name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Billing:</span>
                        <span className="font-medium capitalize">{billingPeriod}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Price:</span>
                        <span className="font-medium">
                          ${selectedClass.pricing?.[billingPeriod] || 0}
                          /{billingPeriod === 'monthly' ? 'month' : 'year'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Free Plan Information */}
            {formData.class === 'scout' && (
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Free Plan</p>
                    <p className="text-sm text-green-700">
                      No payment required. Limited to 3 scout starships per account.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  const getStepTitle = () => {
    if (hasVision) {
      switch (step) {
        case 1: return 'Review Your Vision';
        case 2: return 'Name Your Starship';
        case 3: return 'Choose Your Class';
        case 4: return 'Review & Launch';
        default: return '';
      }
    } else {
      switch (step) {
        case 1: return 'Name Your Starship';
        case 2: return 'Choose Your Class';
        case 3: return 'Review & Launch';
        default: return '';
      }
    }
  };

  const isLastStep = step === totalSteps;
  const isFirstStep = step === 1;

  // Handle modal close with confirmation for onboarding
  const handleModalClose = (newOpen: boolean) => {
    if (!newOpen && isOnboarding && session?.pendingVision) {
      // User is trying to close during onboarding
      setShowExitConfirmation(true);
    } else {
      onOpenChange(newOpen);
    }
  };

  const handleConfirmExit = () => {
    setShowExitConfirmation(false);
    onOpenChange(false);
    // Don't clear session - let them return later
  };

  const handleCancelExit = () => {
    setShowExitConfirmation(false);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={handleModalClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Rocket className="w-5 h-5" />
              Create New Starship
            </span>
            {isOnboarding && (
              <Badge variant="secondary">
                <Eye className="w-3 h-3 mr-1" />
                Vision-Guided
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            {getStepTitle()}
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-2">
          <Progress value={(step / totalSteps) * 100} className="h-2" />
          <p className="text-xs text-muted-foreground mt-2">
            Step {step} of {totalSteps}
          </p>
        </div>
        
        <div className="overflow-y-auto max-h-[50vh] py-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {renderStepContent()}
            </motion.div>
          </AnimatePresence>
        </div>
        
        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={isFirstStep || loading}
          >
            <ChevronLeft className="w-4 h-4 mr-2" />
            Previous
          </Button>
          
          {isLastStep ? (
            <div className="relative">
              {/* Glow effect layer */}
              <motion.div
                className="absolute inset-0 rounded-md bg-primary blur-xl"
                initial={{ opacity: 0 }}
                animate={{ 
                  opacity: [0.2, 0.35, 0.2],
                }}
                transition={{ 
                  duration: 2.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
              <motion.div
                animate={{ 
                  scale: [1, 1.05, 1, 1.05, 1, 1, 1, 1, 1, 1, 1, 1]
                }}
                transition={{ 
                  scale: {
                    duration: 2,
                    repeat: Infinity,
                    ease: "easeInOut",
                    times: [0, 0.075, 0.15, 0.225, 0.3, 0.375, 0.45, 0.6, 0.75, 0.9, 0.95, 1]
                  }
                }}
              >
                <Button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="relative bg-primary hover:bg-primary/90"
                  style={{
                    boxShadow: "0 4px 20px rgba(59, 130, 246, 0.5), 0 2px 10px rgba(59, 130, 246, 0.3)"
                  }}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Rocket className="w-4 h-4 mr-2" />
                      Launch Starship
                    </>
                  )}
                </Button>
              </motion.div>
            </div>
          ) : (
            <Button onClick={handleNext}>
              Next
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
    
    {/* Exit Confirmation Dialog */}
    <Dialog open={showExitConfirmation} onOpenChange={setShowExitConfirmation}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary" />
            Save Your Progress?
          </DialogTitle>
          <DialogDescription>
            Your vision will be saved and you can continue creating your starship anytime.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4">
          <Card className="p-3 bg-muted/50">
            <p className="text-sm italic">
              "{session?.pendingVision?.slice(0, 100)}
              {session?.pendingVision && session.pendingVision.length > 100 ? '...' : ''}"
            </p>
          </Card>
        </div>
        
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleConfirmExit}
            className="flex-1"
          >
            Exit & Save Progress
          </Button>
          <Button
            onClick={handleCancelExit}
            className="flex-1"
          >
            Continue Creating
          </Button>
        </div>
        
        <p className="text-xs text-muted-foreground text-center">
          Your progress is saved for 2 hours
        </p>
      </DialogContent>
    </Dialog>
    </>
  );
}