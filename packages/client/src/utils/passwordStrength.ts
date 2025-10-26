/**
 * Password strength utility functions
 * Provides password validation and strength calculation
 */

export interface PasswordStrength {
  score: number; // 0-4 (weak to very strong)
  label: 'Very Weak' | 'Weak' | 'Fair' | 'Strong' | 'Very Strong';
  color: string;
  percentage: number; // 0-100 for progress bar
  feedback: string[];
}

export interface PasswordRequirements {
  minLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
}

/**
 * Check if password meets all requirements
 */
export function checkPasswordRequirements(password: string): PasswordRequirements {
  return {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasLowercase: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSpecial: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password),
  };
}

/**
 * Calculate password strength score
 */
export function calculatePasswordStrength(password: string): PasswordStrength {
  if (!password) {
    return {
      score: 0,
      label: 'Very Weak',
      color: 'text-gray-500',
      percentage: 0,
      feedback: ['Password is required'],
    };
  }

  const requirements = checkPasswordRequirements(password);
  const feedback: string[] = [];
  let score = 0;

  // Check minimum length
  if (requirements.minLength) {
    score += 1;
  } else {
    feedback.push('At least 8 characters required');
  }

  // Check for uppercase
  if (requirements.hasUppercase) {
    score += 0.5;
  } else {
    feedback.push('Add at least one uppercase letter');
  }

  // Check for lowercase
  if (requirements.hasLowercase) {
    score += 0.5;
  } else {
    feedback.push('Add at least one lowercase letter');
  }

  // Check for numbers
  if (requirements.hasNumber) {
    score += 0.5;
  } else {
    feedback.push('Add at least one number');
  }

  // Check for special characters
  if (requirements.hasSpecial) {
    score += 0.5;
  } else {
    feedback.push('Add at least one special character (!@#$%^&*...)');
  }

  // Bonus points for length
  if (password.length >= 12) {
    score += 0.5;
  }
  if (password.length >= 16) {
    score += 0.5;
  }

  // Cap the score at 4
  score = Math.min(score, 4);

  // Determine label and color based on score
  let label: PasswordStrength['label'];
  let color: string;
  
  if (score < 1) {
    label = 'Very Weak';
    color = 'text-red-600';
  } else if (score < 2) {
    label = 'Weak';
    color = 'text-orange-600';
  } else if (score < 2.5) {
    label = 'Fair';
    color = 'text-yellow-600';
  } else if (score < 3.5) {
    label = 'Strong';
    color = 'text-blue-600';
  } else {
    label = 'Very Strong';
    color = 'text-green-600';
  }

  // Calculate percentage for progress bar
  const percentage = Math.min((score / 4) * 100, 100);

  // Provide positive feedback for strong passwords
  if (score >= 3) {
    feedback.length = 0; // Clear negative feedback
    if (password.length >= 16) {
      feedback.push('Excellent password length!');
    } else if (password.length >= 12) {
      feedback.push('Good password length');
    }
    if (score >= 3.5) {
      feedback.push('Very strong password!');
    } else {
      feedback.push('Strong password');
    }
  }

  return {
    score,
    label,
    color,
    percentage,
    feedback,
  };
}

/**
 * Validate if password meets all requirements
 */
export function validatePassword(password: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  const requirements = checkPasswordRequirements(password);

  if (!requirements.minLength) {
    errors.push('Password must be at least 8 characters');
  }
  if (!requirements.hasUppercase) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!requirements.hasLowercase) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!requirements.hasNumber) {
    errors.push('Password must contain at least one number');
  }
  if (!requirements.hasSpecial) {
    errors.push('Password must contain at least one special character');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Get color class for progress bar based on strength
 */
export function getStrengthColorClass(score: number): string {
  if (score < 1) return 'bg-red-600';
  if (score < 2) return 'bg-orange-600';
  if (score < 2.5) return 'bg-yellow-600';
  if (score < 3.5) return 'bg-blue-600';
  return 'bg-green-600';
}