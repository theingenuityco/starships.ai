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
import { Textarea } from '@/components/ui/textarea';
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
  ArrowRight,
  X,
  Brain,
  Bot
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useStarshipStore } from '@/store/starship-store';
import { useOnboardingSession } from '@/hooks/useOnboardingSession';
import { analyzeVisionPreAuth } from '@/lib/sibil/preview-api';
import { cn } from '@/lib/utils';

interface StarshipCreateModalUnifiedProps {
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

export function StarshipCreateModalUnified({ 
  open, 
  onOpenChange, 
  onSuccess,
  isOnboarding = false 
}: StarshipCreateModalUnifiedProps) {
  const { createStarship, loading } = useStarshipStore();
  const { session: hookSession, clearSession, updateStep } = useOnboardingSession();
  const [showExitConfirmation, setShowExitConfirmation] = useState(false);
  const [visionAnalysis, setVisionAnalysis] = useState<any>(null);
  const [analyzingVision, setAnalyzingVision] = useState(false);
  
  // Try to get session from hook or fallback to localStorage for onboarding
  let session = hookSession;
  if (isOnboarding && !session) {
    try {
      const stored = localStorage.getItem('onboarding_session');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.data) {
          session = parsed.data;
        }
      }
    } catch (e) {
      console.error('[CreateModal] Failed to get localStorage fallback:', e);
    }
  }
  
  // Now only 3 steps: Vision+Name, Class, Review
  const hasPrefilledVision = isOnboarding && session?.pendingVision;
  const totalSteps = 3;
  
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<StarshipFormData>({
    name: '',
    class: 'cruiser',
    vision: hasPrefilledVision ? session?.pendingVision : ''
  });
  const [errors, setErrors] = useState<StarshipFormErrors>({});

  // Update form data if session changes (for onboarding)
  useEffect(() => {
    if (session?.pendingVision && isOnboarding) {
      setFormData(prev => ({
        ...prev,
        vision: session.pendingVision || '',
        name: session.visionAnalysis?.suggestedName || prev.name,
        class: session.visionAnalysis?.recommendedClass || prev.class
      }));
      setVisionAnalysis(session.visionAnalysis);
    }
  }, [session, isOnboarding]);

  const validateStep = (stepNumber: number): boolean => {
    const newErrors: StarshipFormErrors = {};
    
    // Combined Vision + Name step validation
    if (stepNumber === 1) {
      if (!formData.name.trim()) {
        newErrors.name = 'Starship name is required';
      } else if (formData.name.length < 3) {
        newErrors.name = 'Name must be at least 3 characters';
      } else if (formData.name.length > 50) {
        newErrors.name = 'Name must be less than 50 characters';
      }
      
      // Vision is mandatory
      if (!formData.vision?.trim()) {
        newErrors.vision = 'Vision statement is required';
      } else if (formData.vision.length < 20) {
        newErrors.vision = 'Vision should be at least 20 characters';
      }
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleAnalyzeVision = async () => {
    if (!formData.vision?.trim()) return;

    setAnalyzingVision(true);
    try {
      const result = await analyzeVisionPreAuth(formData.vision);
      const analysis = result.analysis;
      setVisionAnalysis(analysis);
      
      // Update form with AI suggestions
      if (analysis.suggestedName && !formData.name) {
        setFormData(prev => ({ ...prev, name: analysis.suggestedName }));
      }
      if (analysis.recommendedClass) {
        setFormData(prev => ({ ...prev, class: analysis.recommendedClass }));
      }
    } catch (error) {
      console.error('Failed to analyze vision:', error);
    } finally {
      setAnalyzingVision(false);
    }
  };

  const handleNext = async () => {
    if (step === 1) {
      // Validate first
      if (!validateStep(step)) return;
      
      // Analyze vision if provided and not already analyzed
      if (formData.vision?.trim() && !visionAnalysis) {
        await handleAnalyzeVision();
      }
      
      setStep(step + 1);
    } else if (validateStep(step)) {
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
      // Create starship with vision if available
      const starshipData: any = {
        name: formData.name,
        class: formData.class
      };
      
      if (formData.vision) {
        starshipData.vision = {
          statement: formData.vision,
          confidence: visionAnalysis?.confidence || 0.8,
          sibilSessionId: session?.sibilSessionId
        };
      }
      
      await createStarship(starshipData);
      
      // Clear onboarding session if we're in onboarding flow
      if (isOnboarding) {
        updateStep('complete');
        setTimeout(() => clearSession(), 1000);
      }
      
      onSuccess();
      handleReset();
    } catch (error) {
      console.error('Failed to create starship:', error);
    }
  };

  const handleReset = () => {
    setStep(1);
    setFormData({
      name: '',
      class: 'cruiser',
      vision: ''
    });
    setVisionAnalysis(null);
    setErrors({});
  };

  const handleClose = () => {
    if (isOnboarding && session?.pendingVision) {
      setShowExitConfirmation(true);
    } else {
      onOpenChange(false);
      handleReset();
    }
  };

  const renderStepContent = () => {
    // Step 1: Combined Vision + Name Input
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
              <Brain className="w-10 h-10 text-primary" />
              <h3 className="text-xl font-semibold">Vision</h3>
            </div>
          </div>

          <div className="space-y-5 px-1">
            {/* Vision Input (Required) */}
            <div className="space-y-2">
              <Label htmlFor="vision" className="flex items-center gap-2">
                <Eye className="w-4 h-4" />
                Vision Statement
                <span className="text-xs text-destructive">*</span>
              </Label>
              <Textarea
                id="vision"
                placeholder="What would you like to build?"
                value={formData.vision}
                onChange={(e) => setFormData({ ...formData, vision: e.target.value })}
                onBlur={handleAnalyzeVision}
                className={cn(
                  "min-h-[100px] bg-background/50 backdrop-blur-sm border border-border/50",
                  "focus:border-primary focus:ring-0 focus:ring-offset-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
                  errors.vision && "border-destructive focus:border-destructive"
                )}
                disabled={isOnboarding && hasPrefilledVision}
                tabIndex={1}
              />
              {errors.vision && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  {errors.vision}
                </p>
              )}
            </div>

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
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className={cn(
                    "pr-10 bg-background/50 backdrop-blur-sm border border-border/50",
                    "focus:border-primary focus:ring-0 focus:ring-offset-0 focus:outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
                    errors.name && "border-destructive focus:border-destructive"
                  )}
                  tabIndex={2}
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

            {/* AI Suggestions */}
            {visionAnalysis && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-primary/5 rounded-lg border border-primary/20"
              >
                <div className="flex items-start gap-3">
                  <Bot className="w-4 h-4 text-emerald-500 mt-0.5" />
                  <div className="flex-1 space-y-3">
                    <div>
                      <p className="text-xs font-medium text-primary tracking-wider mb-1">
                        Sibil AI Analysis
                      </p>
                      <p className="text-sm text-muted-foreground">{visionAnalysis.summary}</p>
                    </div>
                    
                    {visionAnalysis.suggestedName && formData.name !== visionAnalysis.suggestedName && (
                      <div className="pt-2 border-t border-primary/10">
                        <p className="text-xs text-muted-foreground mb-1">Suggested name:</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="p-0 h-auto font-medium text-foreground hover:text-primary hover:bg-transparent"
                          onClick={() => setFormData({ 
                            ...formData, 
                            name: visionAnalysis.suggestedName 
                          })}
                        >
                          Use "{visionAnalysis.suggestedName}"
                          <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {/* Preview Card */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Preview</Label>
              <Card className="bg-card/50 backdrop-blur-sm border-border/50">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-3">
                    <div className="text-2xl">{STARSHIP_CLASSES[formData.class].icon}</div>
                    <div className="flex-1">
                      <div className="font-medium">
                        {formData.name || '________'}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {STARSHIP_CLASSES[formData.class].name} Class Starship
                      </div>
                    </div>
                  </div>
                  {formData.vision && (
                    <div className="mt-3 pt-3 border-t border-border/50">
                      <p className="text-xs text-muted-foreground italic line-clamp-2">
                        "{formData.vision}"
                      </p>
                    </div>
                  )}
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
            {Object.entries(STARSHIP_CLASSES).map(([key, classData]) => {
              const isRecommended = key === 'cruiser' && visionAnalysis?.recommendedClass === 'cruiser';
              
              return (
                <Card
                  key={key}
                  className={cn(
                    "cursor-pointer transition-all duration-200 bg-card/50 backdrop-blur-sm border-border/50",
                    formData.class === key && "ring-2 ring-primary/50 bg-primary/5"
                  )}
                  onClick={() => setFormData({ ...formData, class: key as 'scout' | 'cruiser' })}
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
                      {isRecommended && (
                        <Badge variant="secondary">
                          <Sparkles className="w-3 h-3 mr-1" />
                          Recommended
                        </Badge>
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
                      {classData.features.slice(0, 2).map((feature, index) => (
                        <li key={index} className="flex items-center space-x-2 text-xs">
                          <CheckCircle className="w-3 h-3 text-green-500" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </motion.div>
      );
    }

    // Step 3: Review
    if (step === 3) {
      const selectedClass = STARSHIP_CLASSES[formData.class];
      return (
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
              {formData.vision && (
                <div className="p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Eye className="w-4 h-4 text-muted-foreground mt-0.5" />
                    <div className="flex-1">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                        Vision
                      </p>
                      <p className="text-sm italic">"{formData.vision}"</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Users className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-medium">Agent Capacity</span>
                  </div>
                  <div className="text-2xl font-bold">{selectedClass.maxAgents}</div>
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
      );
    }

    return null;
  };

  const getStepTitle = () => {
    switch (step) {
      case 1: return 'Vision';
      case 2: return 'Choose Your Class';
      case 3: return 'Review & Launch';
      default: return '';
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-2xl bg-background/95 backdrop-blur-sm border-border/50">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              Create New Starship
            </DialogTitle>
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
              {renderStepContent()}
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
                <Button 
                  onClick={handleNext} 
                  disabled={analyzingVision || (step === 1 && (!formData.name.trim() || !formData.vision?.trim()))}
                  className="flex items-center space-x-2"
                >
                  {analyzingVision ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Analyzing...</span>
                    </>
                  ) : (
                    <>
                      <span>Next</span>
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
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

      {/* Exit Confirmation Dialog */}
      <Dialog open={showExitConfirmation} onOpenChange={setShowExitConfirmation}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Are you sure you want to exit?</DialogTitle>
            <DialogDescription>
              Your vision has been saved. You can continue creating your starship later from your fleet page.
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