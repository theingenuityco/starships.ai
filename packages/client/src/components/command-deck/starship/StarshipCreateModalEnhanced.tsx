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
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useStarshipStore } from '@/store/starship-store';
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
  class: 'scout' | 'cruiser';
  vision?: string;
}

interface StarshipFormErrors {
  name?: string;
  class?: string;
  vision?: string;
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
    class: session?.visionAnalysis?.recommendedClass || 'scout',
    vision: session?.pendingVision || ''
  });
  const [errors, setErrors] = useState<StarshipFormErrors>({});

  // Update form data if session changes
  useEffect(() => {
    console.log('[CreateModal] Session check:', { 
      hasSession: !!session, 
      hasPendingVision: !!session?.pendingVision,
      isOnboarding,
      vision: session?.pendingVision?.slice(0, 50)
    });
    
    if (session?.pendingVision && isOnboarding) {
      console.log('[CreateModal] Populating form with vision:', session.pendingVision.slice(0, 50));
      setFormData(prev => ({
        ...prev,
        vision: session.pendingVision || '',
        name: session.visionAnalysis?.suggestedName || prev.name,
        class: session.visionAnalysis?.recommendedClass || prev.class
      }));
    }
  }, [session, isOnboarding]);

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
      // Create starship with vision if available
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
    } catch (error) {
      console.error('Failed to create starship:', error);
    }
  };

  const handleReset = () => {
    setStep(hasVision ? 1 : 2);
    setFormData({
      name: '',
      class: 'scout',
      vision: ''
    });
    setErrors({});
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
        <div className="space-y-6">
          <div>
            <Label htmlFor="name" className="text-base font-medium">
              Starship Name
            </Label>
            <p className="text-sm text-muted-foreground mt-1 mb-3">
              Choose a unique name for your starship
            </p>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Enter starship name..."
              className={cn(
                "text-lg h-12",
                errors.name && "border-red-500 focus:border-red-500"
              )}
              autoFocus
            />
            {errors.name && (
              <p className="text-sm text-red-500 mt-2">{errors.name}</p>
            )}
            {session?.visionAnalysis?.suggestedName && 
             formData.name !== session.visionAnalysis.suggestedName && (
              <Button
                variant="link"
                size="sm"
                className="mt-2 text-primary"
                onClick={() => setFormData({ 
                  ...formData, 
                  name: session.visionAnalysis?.suggestedName || '' 
                })}
              >
                <Sparkles className="w-3 h-3 mr-1" />
                Use suggested: "{session.visionAnalysis.suggestedName}"
              </Button>
            )}
          </div>
          
          <div className="p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">
              <strong>Tip:</strong> Choose a name that reflects your starship's mission or personality. 
              Examples: "Pioneer", "Voyager", "Constellation"
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
            <p className="text-sm text-muted-foreground mt-1 mb-4">
              Choose the class that best fits your mission requirements
            </p>
          </div>
          
          <div className="grid gap-4">
            {Object.entries(STARSHIP_CLASSES).map(([key, shipClass]) => (
              <Card
                key={key}
                className={cn(
                  "cursor-pointer transition-all hover:shadow-md",
                  formData.class === key && "ring-2 ring-primary"
                )}
                onClick={() => setFormData({ ...formData, class: key as 'scout' | 'cruiser' })}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      <span className="text-2xl">{shipClass.icon}</span>
                      <span>{shipClass.name} Class</span>
                    </span>
                    {formData.class === key && (
                      <CheckCircle className="w-5 h-5 text-primary" />
                    )}
                    {session?.visionAnalysis?.recommendedClass === key && (
                      <Badge variant="secondary" className="ml-2">
                        <Sparkles className="w-3 h-3 mr-1" />
                        Recommended
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-3">
                    {shipClass.description}
                  </p>
                  
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <span>Max {shipClass.maxAgents} agents</span>
                    </div>
                    {Object.entries(shipClass.stats).slice(0, 2).map(([stat, value]) => (
                      <div key={stat} className="flex items-center gap-2 text-sm">
                        <div className="w-16 bg-muted rounded-full h-1.5">
                          <div 
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${value}%` }}
                          />
                        </div>
                        <span className="capitalize text-xs">{stat}</span>
                      </div>
                    ))}
                  </div>
                  
                  <div className="space-y-1">
                    {shipClass.features.slice(0, 2).map((feature, index) => (
                      <p key={index} className="text-xs text-muted-foreground">
                        • {feature}
                      </p>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      );
    }

    // Review Step
    const reviewStepNumber = hasVision ? 4 : 3;
    if (step === reviewStepNumber) {
      const selectedClass = STARSHIP_CLASSES[formData.class];
      return (
        <div className="space-y-6">
          <div>
            <Label className="text-base font-medium">Review & Create</Label>
            <p className="text-sm text-muted-foreground mt-1">
              Confirm your starship configuration
            </p>
          </div>
          
          <Card>
            <CardContent className="pt-6 space-y-4">
              {formData.vision && (
                <div>
                  <Label className="text-sm text-muted-foreground">Vision</Label>
                  <div className="mt-1 p-3 bg-primary/10 rounded-lg">
                    <p className="text-sm italic">"{formData.vision}"</p>
                  </div>
                </div>
              )}
              
              <div>
                <Label className="text-sm text-muted-foreground">Name</Label>
                <p className="text-lg font-semibold mt-1">{formData.name}</p>
              </div>
              
              <div>
                <Label className="text-sm text-muted-foreground">Class</Label>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xl">{selectedClass.icon}</span>
                  <span className="font-medium">{selectedClass.name} Class</span>
                  <Badge variant="outline">
                    <Users className="w-3 h-3 mr-1" />
                    Max {selectedClass.maxAgents} agents
                  </Badge>
                </div>
              </div>
              
              <div>
                <Label className="text-sm text-muted-foreground">Capabilities</Label>
                <div className="mt-2 space-y-1">
                  {selectedClass.features.slice(0, 3).map((feature, index) => (
                    <p key={index} className="text-sm text-muted-foreground">
                      • {feature}
                    </p>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
          
          <div className="p-4 bg-primary/10 rounded-lg">
            <p className="text-sm">
              <strong>Ready to launch!</strong> Your starship will be created with the configuration above.
            </p>
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
            <Button
              onClick={handleSubmit}
              disabled={loading}
              className="bg-primary hover:bg-primary/90"
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