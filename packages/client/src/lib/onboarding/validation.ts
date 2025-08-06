import { ValidationResult } from './types';

// Simple profanity list - no external API needed
const BLOCKED_WORDS = ['spam', 'test', 'asdf', 'xxx', 'fuck', 'shit'];

// Test patterns
const TEST_PATTERNS = /^(test|testing|asdf|qwerty|123|aaa|bbb|zzz)/i;

export function validateVision(vision: string): ValidationResult {
  const trimmed = vision.trim().toLowerCase();
  
  // Check minimum length
  if (trimmed.length < 20) {
    return { 
      valid: false, 
      error: 'Vision too short - tell us more! (minimum 20 characters)' 
    };
  }
  
  // Check maximum length
  if (trimmed.length > 500) {
    return { 
      valid: false, 
      error: 'Vision too long - keep it concise! (maximum 500 characters)' 
    };
  }
  
  // Simple profanity check
  if (BLOCKED_WORDS.some(word => trimmed.includes(word))) {
    return { 
      valid: false, 
      error: "Let's focus on building something positive!" 
    };
  }
  
  // Check for test/spam patterns
  if (TEST_PATTERNS.test(trimmed)) {
    return { 
      valid: false, 
      error: 'Please enter a real vision for your project' 
    };
  }

  // Check for repetitive characters (e.g., "aaaaaaa")
  if (/(.)\1{4,}/.test(trimmed)) {
    return { 
      valid: false, 
      error: 'Please enter a meaningful vision' 
    };
  }

  // Check for too few words (at least 3 words)
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount < 3) {
    return { 
      valid: false, 
      error: 'Please provide more detail about your vision' 
    };
  }
  
  return { valid: true };
}

// Sanitize vision for display
export function sanitizeVision(vision: string): string {
  return vision
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .substring(0, 500); // Enforce max length
}

// Check if vision seems vague
export function isVisionVague(vision: string): boolean {
  const vagueTerms = [
    'make money',
    'be successful',
    'get rich',
    'something cool',
    'i dont know',
    'idk',
    'whatever'
  ];
  
  const lower = vision.toLowerCase();
  return vagueTerms.some(term => lower.includes(term));
}

// Generate a prompt for vague visions
export function getVagueVisionPrompt(): string {
  return "That's a start! Can you tell me more specifically what you want to build? For example, what problem will it solve or what value will it create?";
}