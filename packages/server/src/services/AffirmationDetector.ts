/**
 * AffirmationDetector service for detecting user affirmation/rejection in natural language
 * 
 * This service analyzes user messages to determine if they are:
 * - Affirmative (accepting a proposal)
 * - Negative (rejecting a proposal)
 * - Requesting changes (wanting modifications)
 * 
 * It also extracts specific feedback for iterative refinement.
 */
export class AffirmationDetector {
  // Patterns for detecting affirmative responses
  private static readonly AFFIRMATIVE_PATTERNS = [
    // Direct affirmations
    /^(yes|yeah|yep|sure|okay|ok|great|perfect|excellent|sounds good|i like it|let's go with that|that works|approve|confirmed|absolutely|definitely)$/i,
    /^(that's|that is) (good|great|perfect|excellent|it|fine|right|correct)$/i,
    /^i (like|love|approve of?) (it|that|this)$/i,
    /^(go|move) (ahead|forward)( with (it|that|this))?$/i,
    /^(update|save|use) (it|that|this|the vision)$/i,
    /^(looks|sounds) (good|great|perfect|right|fine)( for now)?$/i,
    /^(accept|adopt|implement) (it|that|this)$/i,
    /^that('s| is) exactly what I (want|need|meant)$/i,
    // Complex affirmations with comma
    /^(yes|yeah|yep|sure|okay|ok),?\s+(.*\s)?(sounds|looks|seems|that's|that is)\s+(good|great|perfect|excellent|fine|right)/i,
    
    // Enthusiastic responses
    /^(awesome|amazing|fantastic|brilliant|wonderful)!?$/i,
    /^(much|way|so) better$/i,
    /^(now|that) makes sense$/i,
    /^(spot on|nailed it|hit the mark)$/i,
    
    // Contextual affirmations
    /^(thank you|thanks).*good$/i,
    /perfect.*vision/i,
    /exactly.*wanted/i
  ];

  // Patterns for detecting negative responses
  private static readonly NEGATIVE_PATTERNS = [
    // Direct negations
    /^(no|nope|nah|not really|not quite|not exactly|needs work|don't like|disagree|reject|cancel)$/i,
    /^(that's|that is) not (good|right|it|correct|what I want)$/i,
    /^i don't (like|want|think|agree)( (it|that|this))?$/i,
    /^(let's|let me) think about (it|that|this)$/i,
    /^not (yet|ready|quite|there)$/i,
    /^(maybe|perhaps) not$/i,
    // Complex negations with comma
    /^(no|nope|nah),?\s+(.*\s)?(that's|that is|it's|it is)\s+not\s+(good|right|it|correct|what I want)/i,
    
    // Hesitation patterns
    /^(hmm|well|actually).*(not|don't)/i,
    /^i('m| am) not (sure|convinced|ready)$/i,
    /^(close but|almost but) not/i,
    /^still (not|doesn't)/i,
    
    // Rejection with reasoning
    /doesn't (capture|reflect|represent)/i,
    /missing something/i,
    /not quite right/i,
    /off the mark/i
  ];

  // Patterns for detecting change requests
  private static readonly CHANGE_REQUEST_PATTERNS = [
    // Direct change requests
    /(but|however|although|except|instead|rather|maybe|perhaps|could we|what if|how about)/i,
    /change|modify|adjust|tweak|refine|improve|enhance|alter|revise/i,
    /(make it|can you make it) (more|less|better)/i,
    /(focus|emphasize) (more |)on/i,
    /(add|include|incorporate|mention)/i,
    /(remove|take out|exclude|drop)/i,
    
    // Comparative requests
    /more (specific|actionable|inspiring|clear|detailed|focused)/i,
    /less (vague|complex|wordy|abstract)/i,
    /better (explain|describe|capture|reflect)/i,
    /(stronger|weaker) (language|wording|emphasis)/i,
    
    // Conditional requests
    /what about|how about|consider|maybe try|could also/i,
    /instead of.*try/i,
    /(might|could) be better if/i
  ];

  // Specific feedback extraction patterns
  private static readonly FEEDBACK_PATTERNS = [
    { pattern: /(more|increase|enhance|boost|strengthen) (specific|clarity|detail)/i, feedback: 'increase_specificity' },
    { pattern: /(more|increase) (actionable|action|implementation)/i, feedback: 'increase_actionability' },
    { pattern: /(shorter|more concise|brief|condensed)/i, feedback: 'reduce_length' },
    { pattern: /(longer|more detailed|elaborate|expand)/i, feedback: 'increase_detail' },
    { pattern: /(timeline|timeframe|deadline|when|schedule)/i, feedback: 'add_timeline' },
    { pattern: /(measurable|metrics|kpi|measure|track)/i, feedback: 'add_metrics' },
    { pattern: /(inspiring|motivating|exciting|compelling)/i, feedback: 'increase_inspiration' },
    { pattern: /(realistic|achievable|practical|feasible)/i, feedback: 'increase_realism' },
    { pattern: /(focus|concentrate|emphasize).*(on|more)/i, feedback: 'increase_focus' },
    { pattern: /(simplify|simple|easier|clearer)/i, feedback: 'simplify_language' },
    { pattern: /(technical|jargon|complex)/i, feedback: 'reduce_complexity' }
  ];

  /**
   * Determines if a message contains affirmative response
   * @param message - The message to analyze for affirmative content
   * @returns boolean indicating if the message is affirmative
   * @example
   * detector.isAffirmative("yes, that sounds great"); // returns true
   * detector.isAffirmative("no, I don't like it"); // returns false
   */
  isAffirmative(message: string): boolean {
    const trimmedMessage = message.trim();
    return AffirmationDetector.AFFIRMATIVE_PATTERNS.some(pattern => 
      pattern.test(trimmedMessage)
    );
  }

  /**
   * Determines if a message contains negative response
   * @param message - The message to analyze for negative content
   * @returns boolean indicating if the message is negative
   * @example
   * detector.isNegative("no, that's not right"); // returns true
   * detector.isNegative("yes, perfect!"); // returns false
   */
  isNegative(message: string): boolean {
    const trimmedMessage = message.trim();
    return AffirmationDetector.NEGATIVE_PATTERNS.some(pattern => 
      pattern.test(trimmedMessage)
    );
  }

  /**
   * Determines if a message is requesting changes
   * @param message - The message to analyze for change requests
   * @returns boolean indicating if the message requests changes
   * @example
   * detector.isRequestingChanges("can you make it more specific?"); // returns true
   * detector.isRequestingChanges("that's perfect as is"); // returns false
   */
  isRequestingChanges(message: string): boolean {
    return AffirmationDetector.CHANGE_REQUEST_PATTERNS.some(pattern => 
      pattern.test(message)
    );
  }

  /**
   * Extracts specific feedback points from a message
   * @param message - The message to analyze for feedback
   * @returns Array of feedback types found in the message
   * @example
   * detector.extractFeedback("make it more specific with timeline"); 
   * // returns ["increase_specificity", "add_timeline"]
   */
  extractFeedback(message: string): string[] {
    const feedback: string[] = [];
    const lowerMessage = message.toLowerCase();

    // Check each feedback pattern
    AffirmationDetector.FEEDBACK_PATTERNS.forEach(({ pattern, feedback: feedbackType }) => {
      if (pattern.test(message)) {
        feedback.push(feedbackType);
      }
    });

    // Additional contextual feedback extraction
    if (lowerMessage.includes('too vague') || lowerMessage.includes('not specific')) {
      feedback.push('increase_specificity');
    }
    
    if (lowerMessage.includes('too long') || lowerMessage.includes('wordy')) {
      feedback.push('reduce_length');
    }
    
    if (lowerMessage.includes('not inspiring') || lowerMessage.includes('boring')) {
      feedback.push('increase_inspiration');
    }
    
    if (lowerMessage.includes('hard to understand') || lowerMessage.includes('confusing')) {
      feedback.push('increase_clarity');
    }

    if (lowerMessage.includes('not actionable') || lowerMessage.includes('how do we')) {
      feedback.push('increase_actionability');
    }

    // Remove duplicates
    return [...new Set(feedback)];
  }

  /**
   * Provides a comprehensive analysis of user sentiment and intent
   * @param message - The message to analyze
   * @returns Object containing analysis results with sentiment, intent, and confidence
   * @example
   * detector.analyzeResponse("yes, but can you make it shorter?");
   * // returns { isAffirmative: true, isRequestingChanges: true, intent: 'modify', ... }
   */
  analyzeResponse(message: string): {
    isAffirmative: boolean;
    isNegative: boolean;
    isRequestingChanges: boolean;
    confidence: number;
    feedback: string[];
    intent: 'accept' | 'reject' | 'modify' | 'unclear';
  } {
    const isAffirmative = this.isAffirmative(message);
    const isNegative = this.isNegative(message);
    const isRequestingChanges = this.isRequestingChanges(message);
    const feedback = this.extractFeedback(message);

    // Determine primary intent
    let intent: 'accept' | 'reject' | 'modify' | 'unclear' = 'unclear';
    let confidence = 0.5;

    if (isAffirmative && !isNegative && !isRequestingChanges) {
      intent = 'accept';
      confidence = 0.9;
    } else if (isNegative && !isAffirmative) {
      if (isRequestingChanges || feedback.length > 0) {
        intent = 'modify';
        confidence = 0.8;
      } else {
        intent = 'reject';
        confidence = 0.85;
      }
    } else if (isRequestingChanges || feedback.length > 0) {
      intent = 'modify';
      confidence = 0.75;
    } else if (isAffirmative && isNegative) {
      // Conflicting signals - likely requesting changes
      intent = 'modify';
      confidence = 0.6;
    }

    return {
      isAffirmative,
      isNegative,
      isRequestingChanges,
      confidence,
      feedback,
      intent
    };
  }

  /**
   * Generates appropriate response suggestions based on detected intent
   * @param analysis - The analysis result from analyzeResponse method
   * @returns A suggested response string appropriate for the detected intent
   * @example
   * const analysis = detector.analyzeResponse("yes, perfect!");
   * detector.generateResponseSuggestion(analysis); // returns "Great! I'll update..."
   */
  generateResponseSuggestion(analysis: ReturnType<typeof this.analyzeResponse>): string {
    switch (analysis.intent) {
      case 'accept':
        return "Great! I'll update your vision statement now.";
      
      case 'reject':
        return "No problem! Let me know what specific aspects you'd like me to focus on instead.";
      
      case 'modify':
        const feedbackSuggestions = this.generateFeedbackSuggestions(analysis.feedback);
        return `I understand you'd like some adjustments. ${feedbackSuggestions} Let me refine the vision based on your feedback.`;
      
      case 'unclear':
      default:
        return "I want to make sure I understand correctly. Are you happy with this vision direction, or would you like me to make some changes?";
    }
  }

  /**
   * Generates specific suggestions based on extracted feedback
   * @private
   * @param feedback - Array of feedback types
   * @returns Formatted string with actionable suggestions
   */
  private generateFeedbackSuggestions(feedback: string[]): string {
    if (feedback.length === 0) {
      return "I'll work on improving the overall quality.";
    }

    const suggestions: string[] = [];
    
    if (feedback.includes('increase_specificity')) {
      suggestions.push('I\'ll make it more specific');
    }
    if (feedback.includes('increase_actionability')) {
      suggestions.push('add more actionable elements');
    }
    if (feedback.includes('reduce_length')) {
      suggestions.push('make it more concise');
    }
    if (feedback.includes('increase_detail')) {
      suggestions.push('provide more detail');
    }
    if (feedback.includes('add_timeline')) {
      suggestions.push('include timeline elements');
    }
    if (feedback.includes('add_metrics')) {
      suggestions.push('add measurable goals');
    }
    if (feedback.includes('increase_inspiration')) {
      suggestions.push('make it more inspiring');
    }

    return suggestions.length > 0 ? suggestions.join(', ') + '.' : '';
  }
}