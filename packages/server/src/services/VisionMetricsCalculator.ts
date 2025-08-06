/**
 * VisionMetricsCalculator service for calculating vision quality metrics
 * 
 * This service analyzes vision statements and calculates various quality metrics:
 * - Clarity Score: How clear and easy to understand the vision is
 * - Specificity Score: How specific and detailed the goals are
 * - Actionability Score: How actionable and implementable the vision is
 * - Inspirational Score: How motivating and inspiring the vision is
 * 
 * It also provides completeness checks and overall quality assessment.
 */

export interface VisionMetrics {
  // Quality scores (0-100)
  clarityScore: number;
  specificityScore: number;
  actionabilityScore: number;
  inspirationalScore: number;
  
  // Completeness checks
  hasObjectives: boolean;
  hasTimeframe: boolean;
  hasMeasurables: boolean;
  
  // Overall assessment
  overallQuality: number;
  confidence: number;
  refinementCount: number;
}

export class VisionMetricsCalculator {
  
  /**
   * Calculates comprehensive metrics for a vision statement
   * @param vision - The vision statement to analyze
   * @param refinementCount - Number of times this vision has been refined (default: 0)
   * @returns Promise<VisionMetrics> containing detailed quality metrics
   * @example
   * const metrics = await calculator.calculateMetrics("We will innovate by 2025", 1);
   * console.log(metrics.overallQuality); // e.g., 75
   */
  async calculateMetrics(vision: string | undefined | null, refinementCount: number = 0): Promise<VisionMetrics> {
    // Validate input
    if (!vision || typeof vision !== 'string') {
      throw new Error('Vision statement must be a non-empty string');
    }
    const metrics: VisionMetrics = {
      // Calculate individual quality scores
      clarityScore: this.calculateClarity(vision),
      specificityScore: this.calculateSpecificity(vision),
      actionabilityScore: this.calculateActionability(vision),
      inspirationalScore: this.calculateInspirational(vision),
      
      // Check completeness elements
      hasObjectives: this.detectObjectives(vision),
      hasTimeframe: this.detectTimeframe(vision),
      hasMeasurables: this.detectMeasurables(vision),
      
      // Initialize overall scores
      overallQuality: 0,
      confidence: 0,
      refinementCount
    };
    
    // Calculate weighted average for overall quality
    metrics.overallQuality = this.calculateOverallQuality(metrics);
    
    // Calculate AI confidence based on quality and completeness
    metrics.confidence = this.calculateConfidence(metrics);
    
    return metrics;
  }

  /**
   * Calculates clarity score based on sentence structure, word complexity, and readability
   * @private
   * @param vision - The vision statement to analyze
   * @returns Clarity score from 0-100 (higher is clearer)
   */
  private calculateClarity(vision: string): number {
    if (!vision) return 0;
    const sentences = vision.split(/[.!?]/).filter(s => s.trim()).length;
    const words = vision.split(/\s+/).filter(w => w.length > 0);
    const wordCount = words.length;
    
    if (sentences === 0 || wordCount === 0) return 0;
    
    const avgWordsPerSentence = wordCount / sentences;
    
    let score = 100;
    
    // Optimal sentence length is 15-25 words
    if (avgWordsPerSentence > 30) {
      score -= (avgWordsPerSentence - 30) * 2;
    } else if (avgWordsPerSentence < 8) {
      score -= (8 - avgWordsPerSentence) * 3;
    }
    
    // Penalize overly complex words (>10 characters)
    const complexWords = words.filter(word => word.length > 10).length;
    const complexWordRatio = complexWords / wordCount;
    score -= complexWordRatio * 30;
    
    // Penalize jargon and unclear terms
    const jargonTerms = ['synergies', 'paradigm', 'leverage', 'utilize', 'facilitate', 'optimize'];
    const jargonCount = jargonTerms.filter(term => 
      vision.toLowerCase().includes(term)
    ).length;
    score -= jargonCount * 8;
    
    // Reward clear structure words
    const structureWords = ['will', 'to', 'by', 'through', 'with', 'for'];
    const structureCount = structureWords.filter(word => 
      vision.toLowerCase().includes(` ${word} `)
    ).length;
    score += structureCount * 2;
    
    // Bonus for appropriate length (50-200 words)
    if (wordCount >= 50 && wordCount <= 200) {
      score += 5;
    } else if (wordCount < 20) {
      score -= 15;
    } else if (wordCount > 300) {
      score -= 20;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculates specificity score based on concrete terms vs vague language
   * @private
   * @param vision - The vision statement to analyze
   * @returns Specificity score from 0-100 (higher is more specific)
   */
  private calculateSpecificity(vision: string): number {
    const lowerVision = vision.toLowerCase();
    let score = 60; // Base score
    
    // Penalize vague terms
    const vagueTerms = [
      'things', 'stuff', 'various', 'different', 'some', 'many', 'several',
      'generally', 'usually', 'often', 'sometimes', 'mostly', 'likely',
      'etc', 'and so on', 'among others', 'and more'
    ];
    
    vagueTerms.forEach(term => {
      if (lowerVision.includes(term)) {
        score -= 5;
      }
    });
    
    // Reward specific indicators
    const specificIndicators = /\d+|first|second|third|specific|particular|exact|precisely|exactly/gi;
    const specificMatches = vision.match(specificIndicators);
    if (specificMatches) {
      score += Math.min(20, specificMatches.length * 4);
    }
    
    // Reward measurable goals and metrics
    const measurablePatterns = [
      /\d+%/g,                              // Percentages
      /\$\d+/g,                            // Dollar amounts
      /\d+\s*(users|customers|products|clients|members)/gi, // User metrics
      /by\s+\d{4}/gi,                      // Years
      /within\s+\d+\s+(days|weeks|months|years)/gi, // Timeframes
      /(increase|decrease|improve|grow|reduce)\s+by\s+\d+/gi // Improvement metrics
    ];
    
    measurablePatterns.forEach(pattern => {
      const matches = vision.match(pattern);
      if (matches) {
        score += Math.min(15, matches.length * 5);
      }
    });
    
    // Reward industry-specific or domain-specific terms
    const domainTerms = [
      'platform', 'solution', 'technology', 'innovation', 'market', 'customers',
      'revenue', 'growth', 'efficiency', 'quality', 'experience', 'value'
    ];
    
    const domainMatches = domainTerms.filter(term => 
      lowerVision.includes(term)
    ).length;
    score += Math.min(10, domainMatches * 2);
    
    // Bonus for specific outcomes or deliverables
    if (/deliver|create|build|develop|launch|achieve|establish/i.test(vision)) {
      score += 8;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculates actionability score based on action verbs and implementation clarity
   * @private
   * @param vision - The vision statement to analyze
   * @returns Actionability score from 0-100 (higher is more actionable)
   */
  private calculateActionability(vision: string): number {
    const lowerVision = vision.toLowerCase();
    let score = 50; // Base score
    
    // Reward strong action verbs
    const strongActionVerbs = [
      'create', 'build', 'develop', 'launch', 'deliver', 'implement',
      'establish', 'achieve', 'execute', 'produce', 'construct', 'deploy'
    ];
    
    const strongActions = strongActionVerbs.filter(verb => 
      lowerVision.includes(verb)
    ).length;
    score += strongActions * 8;
    
    // Reward medium action verbs
    const mediumActionVerbs = [
      'improve', 'enhance', 'optimize', 'increase', 'grow', 'expand',
      'strengthen', 'advance', 'progress', 'transform'
    ];
    
    const mediumActions = mediumActionVerbs.filter(verb => 
      lowerVision.includes(verb)
    ).length;
    score += mediumActions * 5;
    
    // Penalize passive or weak language
    const weakTerms = [
      'hope to', 'try to', 'attempt', 'maybe', 'perhaps', 'possibly',
      'might', 'could', 'should probably', 'wish to'
    ];
    
    weakTerms.forEach(term => {
      if (lowerVision.includes(term)) {
        score -= 8;
      }
    });
    
    // Reward process or methodology indicators
    const processIndicators = [
      'through', 'by', 'using', 'via', 'with', 'leveraging',
      'implementing', 'utilizing', 'applying'
    ];
    
    const processCount = processIndicators.filter(indicator => 
      lowerVision.includes(indicator)
    ).length;
    score += Math.min(12, processCount * 3);
    
    // Reward step-by-step or sequential indicators
    const sequentialTerms = ['first', 'then', 'next', 'finally', 'step', 'phase'];
    const sequentialCount = sequentialTerms.filter(term => 
      lowerVision.includes(term)
    ).length;
    score += sequentialCount * 4;
    
    // Bonus for resource allocation mentions
    if (/team|resources|budget|investment|funding|staff/i.test(vision)) {
      score += 6;
    }
    
    // Bonus for clear outcomes or success criteria
    if (/result in|outcome|success|completion|finished/i.test(vision)) {
      score += 5;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculates inspirational score based on motivational language and vision appeal
   * @private
   * @param vision - The vision statement to analyze
   * @returns Inspirational score from 0-100 (higher is more inspiring)
   */
  private calculateInspirational(vision: string): number {
    const lowerVision = vision.toLowerCase();
    let score = 55; // Base score
    
    // Reward inspirational words
    const inspirationalWords = [
      'transform', 'revolutionize', 'innovate', 'pioneer', 'lead', 'excel',
      'outstanding', 'exceptional', 'remarkable', 'extraordinary', 'breakthrough',
      'cutting-edge', 'world-class', 'industry-leading', 'best-in-class'
    ];
    
    const inspirationalCount = inspirationalWords.filter(word => 
      lowerVision.includes(word)
    ).length;
    score += inspirationalCount * 6;
    
    // Reward positive impact language
    const impactWords = [
      'empower', 'enable', 'improve', 'enhance', 'benefit', 'serve',
      'help', 'support', 'contribute', 'make a difference', 'positive impact',
      'better world', 'change lives', 'meaningful'
    ];
    
    const impactCount = impactWords.filter(word => 
      lowerVision.includes(word)
    ).length;
    score += impactCount * 5;
    
    // Reward future-oriented language
    const futureWords = [
      'future', 'tomorrow', 'ahead', 'forward', 'next generation',
      'years to come', 'long-term', 'sustainable', 'lasting'
    ];
    
    const futureCount = futureWords.filter(word => 
      lowerVision.includes(word)
    ).length;
    score += futureCount * 4;
    
    // Reward ambitious yet achievable language
    const ambitiousWords = [
      'ambitious', 'bold', 'comprehensive', 'significant', 'major',
      'substantial', 'considerable', 'extensive'
    ];
    
    const ambitiousCount = ambitiousWords.filter(word => 
      lowerVision.includes(word)
    ).length;
    score += ambitiousCount * 3;
    
    // Penalize overly generic or cliché phrases
    const clicheTerms = [
      'best in class', 'world class', 'cutting edge', 'state of the art',
      'next level', 'game changer', 'paradigm shift'
    ];
    
    clicheTerms.forEach(term => {
      if (lowerVision.includes(term)) {
        score -= 4;
      }
    });
    
    // Reward emotional connection words
    const emotionalWords = [
      'passionate', 'committed', 'dedicated', 'proud', 'excited',
      'thrilled', 'motivated', 'inspired', 'energized'
    ];
    
    const emotionalCount = emotionalWords.filter(word => 
      lowerVision.includes(word)
    ).length;
    score += emotionalCount * 4;
    
    // Bonus for community or collective benefit
    if (/community|society|everyone|all|together|collective/i.test(vision)) {
      score += 6;
    }
    
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Detects if the vision contains clear objectives
   * @private
   * @param vision - The vision statement to analyze
   * @returns boolean indicating if objectives are present
   */
  private detectObjectives(vision: string): boolean {
    const objectivePatterns = [
      /will\s+\w+/g,                       // "will create", "will build"
      /aim to|goal|objective|target/i,     // Direct objective words
      /achieve|accomplish|deliver|complete/i, // Achievement words
      /to\s+\w+/g,                        // Infinitive phrases "to build", "to create"
      /our mission is to/i,               // Mission statements
      /we\s+(plan to|intend to|seek to)/i // Intent statements
    ];
    
    return objectivePatterns.some(pattern => pattern.test(vision));
  }

  /**
   * Detects if the vision contains time-related elements
   * @private
   * @param vision - The vision statement to analyze
   * @returns boolean indicating if timeframe is present
   */
  private detectTimeframe(vision: string): boolean {
    const timePatterns = [
      /\d{4}/,                            // Years (2024, 2025)
      /by\s+(january|february|march|april|may|june|july|august|september|october|november|december)/i,
      /by\s+(q[1-4]|\d{4})/i,            // Quarters or years
      /within\s+\d+\s+(days|weeks|months|years)/i,
      /next\s+(quarter|year|month|decade)/i,
      /in\s+the\s+(coming|next)\s+(year|years)/i,
      /(short|medium|long).?term/i,       // Term indicators
      /over\s+the\s+(next|\d+)/i,        // Duration indicators
      /by\s+the\s+end\s+of/i             // Deadline indicators
    ];
    
    return timePatterns.some(pattern => pattern.test(vision));
  }

  /**
   * Detects if the vision contains measurable elements
   * @private
   * @param vision - The vision statement to analyze
   * @returns boolean indicating if measurable goals are present
   */
  private detectMeasurables(vision: string): boolean {
    const measurablePatterns = [
      /\d+%/,                             // Percentages
      /\$\d+/,                           // Dollar amounts
      /\d+\s*(users|customers|products|clients|members|employees)/i,
      /\d+\s*(million|billion|thousand)/i, // Scale indicators
      /(increase|decrease|improve|grow|reduce)\s+by\s+\d+/i,
      /\d+x\s+(faster|better|more)/i,    // Multiplier improvements
      /(top|#1|first|leading)\s+\d+/i,   // Ranking goals
      /revenue of|profit of|value of/i,   // Financial metrics
      /market share/i,                    // Market metrics
      /satisfaction.*(score|rating)/i     // Quality metrics
    ];
    
    return measurablePatterns.some(pattern => pattern.test(vision));
  }

  /**
   * Calculates overall quality as weighted average of individual scores
   * @private
   * @param metrics - VisionMetrics object containing individual scores
   * @returns Overall quality score (0-100) as weighted average
   */
  private calculateOverallQuality(metrics: VisionMetrics): number {
    // Weighted average with emphasis on actionability and specificity
    return Math.round(
      metrics.clarityScore * 0.25 +          // 25% weight on clarity
      metrics.specificityScore * 0.30 +      // 30% weight on specificity
      metrics.actionabilityScore * 0.30 +    // 30% weight on actionability  
      metrics.inspirationalScore * 0.15      // 15% weight on inspiration
    );
  }

  /**
   * Calculates confidence score based on quality and completeness
   * @private
   * @param metrics - VisionMetrics object containing scores and completeness flags
   * @returns Confidence score (0-1) indicating reliability of analysis
   */
  private calculateConfidence(metrics: VisionMetrics): number {
    // Base confidence from overall quality
    let confidence = metrics.overallQuality / 100;
    
    // Bonus for completeness elements
    let completenessBonus = 0;
    if (metrics.hasObjectives) completenessBonus += 0.1;
    if (metrics.hasTimeframe) completenessBonus += 0.08;
    if (metrics.hasMeasurables) completenessBonus += 0.12;
    
    // Apply completeness bonus
    confidence += completenessBonus;
    
    // Penalty for very low individual scores
    const minAcceptableScore = 40;
    if (metrics.clarityScore < minAcceptableScore) confidence -= 0.1;
    if (metrics.specificityScore < minAcceptableScore) confidence -= 0.15;
    if (metrics.actionabilityScore < minAcceptableScore) confidence -= 0.15;
    
    // Bonus for high refinement count (indicates iterative improvement)
    if (metrics.refinementCount > 2) {
      confidence += Math.min(0.1, metrics.refinementCount * 0.02);
    }
    
    // Ensure confidence stays within bounds
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Provides detailed analysis of what could improve the vision
   * @param metrics - VisionMetrics object to analyze
   * @returns Object containing recommendations, priority area, and completeness gaps
   * @example
   * const analysis = calculator.analyzeImprovementAreas(metrics);
   * console.log(analysis.priorityArea); // e.g., 'specificity'
   * console.log(analysis.recommendations); // Array of improvement suggestions
   */
  analyzeImprovementAreas(metrics: VisionMetrics): {
    recommendations: string[];
    priorityArea: 'clarity' | 'specificity' | 'actionability' | 'inspiration';
    completenessGaps: string[];
  } {
    const recommendations: string[] = [];
    const completenessGaps: string[] = [];
    
    // Identify lowest scoring area as priority
    const scores = {
      clarity: metrics.clarityScore,
      specificity: metrics.specificityScore,
      actionability: metrics.actionabilityScore,
      inspiration: metrics.inspirationalScore
    };
    
    const priorityArea = Object.keys(scores).reduce((a, b) => 
      scores[a as keyof typeof scores] < scores[b as keyof typeof scores] ? a : b
    ) as keyof typeof scores;
    
    // Generate specific recommendations
    if (metrics.clarityScore < 70) {
      recommendations.push('Simplify language and break down complex sentences');
      recommendations.push('Avoid jargon and use clear, direct language');
    }
    
    if (metrics.specificityScore < 70) {
      recommendations.push('Add specific metrics, numbers, or measurable outcomes');
      recommendations.push('Replace vague terms with concrete, specific language');
    }
    
    if (metrics.actionabilityScore < 70) {
      recommendations.push('Use stronger action verbs and implementation-focused language');
      recommendations.push('Include how the vision will be achieved or executed');
    }
    
    if (metrics.inspirationalScore < 70) {
      recommendations.push('Add more motivational and forward-looking language');
      recommendations.push('Emphasize the positive impact and meaningful outcomes');
    }
    
    // Check completeness gaps
    if (!metrics.hasObjectives) {
      completenessGaps.push('Clear objectives or goals');
    }
    if (!metrics.hasTimeframe) {
      completenessGaps.push('Timeline or timeframe');
    }
    if (!metrics.hasMeasurables) {
      completenessGaps.push('Measurable outcomes or metrics');
    }
    
    return {
      recommendations,
      priorityArea,
      completenessGaps
    };
  }
}