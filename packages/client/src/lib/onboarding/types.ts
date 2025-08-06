export interface VisionAnalysis {
  summary: string;
  suggestedName: string;
  recommendedClass: 'scout' | 'cruiser';
  confidence: number;
  keywords: string[];
}

export type OnboardingStep = 'vision' | 'auth' | 'creation' | 'complete';

export interface OnboardingSession {
  // Vision Data
  pendingVision: string | null;
  visionAnalysis: VisionAnalysis | null;
  
  // Flow State
  isOnboarding: boolean;
  onboardingStep: OnboardingStep;
  startedAt: number;
  
  // Sibil Context
  sibilSessionId: string;
  sibilMessages: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
  }>;
  
  // Error Handling
  lastError: string | null;
  retryCount: number;
}

export interface StorageSchema {
  version: number; // Current: 1
  data: OnboardingSession;
  metadata: {
    createdAt: number;
    updatedAt: number;
    expiresAt: number;
    deviceId: string;
  };
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
}