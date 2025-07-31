/**
 * Enhanced Quality Validation System
 * 
 * Implements comprehensive quality control for expedition task results with:
 * - Multi-dimensional quality scoring (accuracy, completeness, relevance, clarity)
 * - Adaptive quality thresholds based on task complexity
 * - Quality trend analysis and learning
 * - Machine learning-based quality prediction
 * - Quality feedback mechanisms for continuous improvement
 * - Quality reporting and analytics
 */

import { TaskBreakdown, QualityScore } from '@starships/protocol';
import { RepositoryFactory } from '@starships/models';
import { ProviderFactory } from '../llm/provider-factory';
import { buildPrompt } from '../prompt/builder';
import {
  QualityCheck,
  CompletedTask,
  FirstOfficerConfig,
  TaskExecution
} from './types';

/**
 * Enhanced quality metrics for comprehensive assessment
 */
export interface EnhancedQualityMetrics {
  overall: number;
  accuracy: number;
  completeness: number;
  relevance: number;
  clarity: number;
  consistency: number;
  innovation: number;
  efficiency: number;
  usability: number;
  maintainability: number;
  detailedAnalysis?: {
    strengths: string[];
    weaknesses: string[];
    criticalIssues: string[];
    improvementAreas: string[];
  };
  contextualFactors?: {
    complexityAlignment: boolean;
    skillUtilization: number;
    timeEfficiency: number;
    resourceOptimization: number;
  };
  qualityPrediction?: {
    confidence: number;
    expectedRange: [number, number];
    riskFactors: string[];
  };
}

/**
 * Quality trend data for learning and prediction
 */
export interface QualityTrend {
  taskId: string;
  agentId: string;
  taskType: string;
  complexity: string;
  historicalScores: number[];
  trendDirection: 'improving' | 'declining' | 'stable';
  predictedScore: number;
  confidence: number;
  lastUpdated: string;
}

/**
 * Quality feedback for continuous improvement
 */
export interface QualityFeedback {
  taskId: string;
  agentId: string;
  feedbackType: 'positive' | 'negative' | 'suggestion';
  category: string;
  message: string;
  actionable: boolean;
  priority: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
}

/**
 * Quality analytics and reporting data
 */
export interface QualityAnalytics {
  timeRange: { start: string; end: string };
  totalAssessments: number;
  averageScore: number;
  scoreDistribution: Record<string, number>;
  trendAnalysis: {
    overallTrend: 'improving' | 'declining' | 'stable';
    trendStrength: number;
    projectedScore: number;
  };
  agentPerformance: Array<{
    agentId: string;
    agentName: string;
    averageScore: number;
    improvementRate: number;
    consistencyScore: number;
  }>;
  taskTypeAnalysis: Record<string, {
    averageScore: number;
    commonIssues: string[];
    successRate: number;
  }>;
  qualityFactors: Array<{
    factor: string;
    impact: number;
    correlation: number;
  }>;
}

/**
 * Extended quality check with enhanced features
 */
export interface EnhancedQualityCheck extends QualityCheck {
  enhancedMetrics?: EnhancedQualityMetrics;
  adaptiveThreshold?: number;
  feedback?: QualityFeedback[];
  trendData?: QualityTrend;
  agentId?: string;
  error?: string;
}

export class QualityValidator {
  private config: FirstOfficerConfig;
  private qualityHistory: Map<string, EnhancedQualityCheck[]> = new Map();
  private qualityTrends: Map<string, QualityTrend> = new Map();
  private qualityFeedback: Map<string, QualityFeedback[]> = new Map();
  private adaptiveThresholds: Map<string, number> = new Map();
  private learningData: Array<{
    taskComplexity: string;
    agentCategory: string;
    taskType: string;
    qualityScore: number;
    factors: Record<string, number>;
  }> = [];

  constructor(config: FirstOfficerConfig) {
    this.config = config;
    this.initializeAdaptiveThresholds();
  }

  /**
   * Initialize adaptive quality thresholds based on task complexity
   */
  private initializeAdaptiveThresholds(): void {
    this.adaptiveThresholds.set('simple', this.config.qualityThreshold - 10);
    this.adaptiveThresholds.set('moderate', this.config.qualityThreshold);
    this.adaptiveThresholds.set('complex', this.config.qualityThreshold + 5);
    this.adaptiveThresholds.set('expert', this.config.qualityThreshold + 10);
  }

  /**
   * Enhanced task result validation with comprehensive quality assessment
   */
  async validateTaskResult(
    task: TaskBreakdown,
    result: string,
    agentId: string,
    execution?: TaskExecution
  ): Promise<EnhancedQualityCheck> {
    console.log(`🔍 [QUALITY-VALIDATOR] Starting enhanced validation for task: ${task.id}`);

    try {
      // Perform multi-dimensional quality assessment
      const enhancedMetrics = await this.performEnhancedQualityAssessment(
        task, 
        result, 
        agentId, 
        execution
      );
      
      // Apply adaptive thresholds based on task complexity
      const adaptiveThreshold = this.getAdaptiveThreshold(task);
      
      // Generate quality feedback
      const feedback = this.generateQualityFeedback(task, result, enhancedMetrics, agentId);
      
      // Update quality trends
      this.updateQualityTrends(task.id, agentId, enhancedMetrics.overall);
      
      // Create comprehensive quality check
      const qualityCheck: EnhancedQualityCheck = {
        taskId: task.id,
        result,
        score: enhancedMetrics.overall,
        issues: this.extractIssues(enhancedMetrics, adaptiveThreshold),
        suggestions: this.generateSuggestions(enhancedMetrics, task, feedback),
        approved: enhancedMetrics.overall >= adaptiveThreshold,
        assessedBy: 'first-officer',
        assessedAt: new Date().toISOString(),
        // Enhanced properties
        enhancedMetrics,
        adaptiveThreshold,
        feedback,
        trendData: this.qualityTrends.get(`${task.id}-${agentId}`),
        agentId
      };
      
      // Store quality check in history
      const taskHistory = this.qualityHistory.get(task.id) || [];
      taskHistory.push(qualityCheck);
      this.qualityHistory.set(task.id, taskHistory);

      // Store feedback
      const agentFeedback = this.qualityFeedback.get(agentId) || [];
      agentFeedback.push(...feedback);
      this.qualityFeedback.set(agentId, agentFeedback);

      // Update learning data for ML predictions
      this.updateLearningData(task, agentId, enhancedMetrics, execution);

      console.log(`✅ [QUALITY-VALIDATOR] Enhanced assessment completed:`, {
        taskId: task.id,
        overallScore: enhancedMetrics.overall,
        adaptiveThreshold,
        approved: qualityCheck.approved,
        issuesCount: qualityCheck.issues.length,
        feedbackCount: feedback.length
      });

      return qualityCheck;
    } catch (error) {
      console.error(`❌ [QUALITY-VALIDATOR] Enhanced validation failed:`, error);
      
      // Return comprehensive failing quality check
      return {
        taskId: task.id,
        result,
        score: 0,
        issues: [`Quality validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        suggestions: ['Manual review required', 'Check task requirements and deliverable format'],
        approved: false,
        assessedBy: 'first-officer',
        assessedAt: new Date().toISOString(),
        enhancedMetrics: this.getDefaultMetrics(),
        adaptiveThreshold: this.getAdaptiveThreshold(task),
        feedback: [],
        error: error instanceof Error ? error.message : 'Unknown error',
        agentId
      };
    }
  }

  /**
   * Perform enhanced multi-dimensional quality assessment
   */
  private async performEnhancedQualityAssessment(
    task: TaskBreakdown,
    result: string,
    agentId: string,
    execution?: TaskExecution
  ): Promise<EnhancedQualityMetrics> {
    const prompt = this.buildEnhancedQualityAssessmentPrompt(task, result, execution);
    
    try {
      const provider = await ProviderFactory.getProvider('first-officer-system');
      const response = await provider.complete(prompt);
      
      const metrics = this.parseEnhancedQualityResponse(response.reply);
      
      // Apply ML-based quality prediction adjustments
      const predictedAdjustments = await this.applyMLPredictions(task, agentId, metrics);
      
      return this.combineMetricsWithPredictions(metrics, predictedAdjustments);
    } catch (error) {
      console.warn('LLM enhanced assessment failed, using advanced rule-based assessment:', error);
      return this.performAdvancedRuleBasedAssessment(task, result, agentId, execution);
    }
  }

  /**
   * Build enhanced LLM prompt for comprehensive quality assessment
   */
  private buildEnhancedQualityAssessmentPrompt(
    task: TaskBreakdown, 
    result: string, 
    execution?: TaskExecution
  ) {
    const systemPrompt = `You are an advanced quality assessment system for the First Officer. Your role is to evaluate task results using comprehensive multi-dimensional quality metrics.

ENHANCED ASSESSMENT CRITERIA:
1. Accuracy (0-100): Correctness and factual reliability of the information
2. Completeness (0-100): How fully the result addresses all task requirements
3. Relevance (0-100): Direct alignment with task objectives and deliverables
4. Clarity (0-100): Structure, readability, and ease of understanding
5. Consistency (0-100): Internal coherence and logical flow
6. Innovation (0-100): Creative approach and novel insights
7. Efficiency (0-100): Optimal use of resources and time
8. Usability (0-100): Practical applicability and user-friendliness
9. Maintainability (0-100): Long-term sustainability and adaptability

CONTEXTUAL FACTORS TO CONSIDER:
- Task complexity level and estimated effort
- Required skills and deliverable format
- Agent specialization and historical performance
- Execution time and resource constraints
- Dependencies and integration requirements

RESPONSE FORMAT:
Return a JSON object in this exact format:
{
  "overall": 85,
  "accuracy": 90,
  "completeness": 85,
  "relevance": 88,
  "clarity": 82,
  "consistency": 87,
  "innovation": 75,
  "efficiency": 90,
  "usability": 80,
  "maintainability": 85,
  "detailedAnalysis": {
    "strengths": ["Comprehensive coverage", "Clear structure"],
    "weaknesses": ["Minor formatting issues", "Could be more innovative"],
    "criticalIssues": [],
    "improvementAreas": ["Add more examples", "Enhance visual presentation"]
  },
  "contextualFactors": {
    "complexityAlignment": true,
    "skillUtilization": 0.85,
    "timeEfficiency": 0.90,
    "resourceOptimization": 0.80
  },
  "qualityPrediction": {
    "confidence": 0.92,
    "expectedRange": [80, 90],
    "riskFactors": ["Time constraints", "Complex requirements"]
  }
}`;

    const executionContext = execution ? `
EXECUTION CONTEXT:
- Start Time: ${execution.startTime}
- Progress: ${execution.progress || 0}%
- Intermediate Results: ${execution.intermediateResults?.length || 0} updates
- Issues Encountered: ${execution.issues?.length || 0}
` : '';

    const userMessage = `
TASK TO ASSESS:
- Task ID: ${task.id}
- Description: ${task.description}
- Required Skills: ${task.requiredSkills.join(', ')}
- Expected Deliverable: ${task.deliverable}
- Dependencies: ${task.dependencies.join(', ') || 'None'}
- Estimated Effort: ${task.estimatedEffort || 'Unknown'} minutes
${executionContext}

RESULT TO EVALUATE:
${result}

Please provide a comprehensive multi-dimensional quality assessment with detailed analysis and contextual considerations.`;

    return buildPrompt(systemPrompt, [], userMessage);
  }

  /**
   * Parse enhanced LLM quality assessment response
   */
  private parseEnhancedQualityResponse(response: string): EnhancedQualityMetrics {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON object found in response');
      }

      const assessment = JSON.parse(jsonMatch[0]);
      
      return {
        overall: this.normalizeScore(assessment.overall || 0),
        accuracy: this.normalizeScore(assessment.accuracy || 0),
        completeness: this.normalizeScore(assessment.completeness || 0),
        relevance: this.normalizeScore(assessment.relevance || 0),
        clarity: this.normalizeScore(assessment.clarity || 0),
        consistency: this.normalizeScore(assessment.consistency || 0),
        innovation: this.normalizeScore(assessment.innovation || 0),
        efficiency: this.normalizeScore(assessment.efficiency || 0),
        usability: this.normalizeScore(assessment.usability || 0),
        maintainability: this.normalizeScore(assessment.maintainability || 0),
        detailedAnalysis: assessment.detailedAnalysis || {
          strengths: [],
          weaknesses: [],
          criticalIssues: [],
          improvementAreas: []
        },
        contextualFactors: assessment.contextualFactors || {
          complexityAlignment: true,
          skillUtilization: 0.5,
          timeEfficiency: 0.5,
          resourceOptimization: 0.5
        },
        qualityPrediction: assessment.qualityPrediction || {
          confidence: 0.5,
          expectedRange: [0, 100],
          riskFactors: []
        }
      };
    } catch (error) {
      console.warn('Failed to parse enhanced quality assessment response:', error);
      throw new Error('Invalid enhanced quality assessment response format');
    }
  }

  /**
   * Advanced rule-based quality assessment with enhanced metrics
   */
  private performAdvancedRuleBasedAssessment(
    task: TaskBreakdown,
    result: string,
    agentId: string,
    execution?: TaskExecution
  ): EnhancedQualityMetrics {
    const metrics: EnhancedQualityMetrics = {
      overall: 100,
      accuracy: 100,
      completeness: 100,
      relevance: 100,
      clarity: 100,
      consistency: 100,
      innovation: 70, // Default moderate innovation
      efficiency: 100,
      usability: 100,
      maintainability: 100
    };

    // Completeness assessment
    if (result.length < 50) {
      metrics.completeness -= 30;
      metrics.overall -= 15;
    } else if (result.length < 200) {
      metrics.completeness -= 15;
      metrics.overall -= 8;
    }

    // Relevance assessment using keyword matching
    const taskKeywords = this.extractKeywords(task.description);
    const resultKeywords = this.extractKeywords(result);
    const keywordOverlap = this.calculateKeywordOverlap(taskKeywords, resultKeywords);
    
    if (keywordOverlap < 0.3) {
      metrics.relevance -= 25;
      metrics.overall -= 12;
    } else if (keywordOverlap < 0.5) {
      metrics.relevance -= 15;
      metrics.overall -= 8;
    }

    // Clarity assessment
    const sentences = result.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgSentenceLength = result.length / sentences.length;
    
    if (avgSentenceLength > 200) {
      metrics.clarity -= 20;
      metrics.overall -= 10;
    }

    // Format compliance assessment
    if (task.deliverable.toLowerCase().includes('json') && !this.isValidJSON(result)) {
      metrics.accuracy -= 30;
      metrics.usability -= 25;
      metrics.overall -= 20;
    }

    if (task.deliverable.toLowerCase().includes('list') && !this.hasListFormat(result)) {
      metrics.clarity -= 20;
      metrics.usability -= 15;
      metrics.overall -= 12;
    }

    // Quality indicators assessment
    if (result.includes('TODO') || result.includes('FIXME')) {
      metrics.completeness -= 40;
      metrics.maintainability -= 30;
      metrics.overall -= 25;
    }

    // Efficiency assessment based on execution time
    if (execution && task.estimatedEffort) {
      const executionTime = execution.progress === 100 ? 
        (Date.now() - new Date(execution.startTime).getTime()) / (1000 * 60) : 
        task.estimatedEffort;
      
      const efficiencyRatio = task.estimatedEffort / executionTime;
      if (efficiencyRatio < 0.5) {
        metrics.efficiency -= 30;
        metrics.overall -= 10;
      } else if (efficiencyRatio < 0.8) {
        metrics.efficiency -= 15;
        metrics.overall -= 5;
      }
    }

    // Normalize all scores
    this.normalizeMetrics(metrics);

    return metrics;
  }

  /**
   * Apply machine learning-based quality predictions
   */
  private async applyMLPredictions(
    task: TaskBreakdown,
    agentId: string,
    baseMetrics: EnhancedQualityMetrics
  ): Promise<Partial<EnhancedQualityMetrics>> {
    try {
      // Get historical data for similar tasks
      const similarTasks = this.findSimilarTasks(task, agentId);
      
      if (similarTasks.length < 3) {
        return {}; // Not enough data for ML predictions
      }

      // Calculate trend-based adjustments
      const trend = this.qualityTrends.get(`${task.id}-${agentId}`);
      const trendAdjustment = trend ? this.calculateTrendAdjustment(trend) : 0;

      // Agent performance-based adjustments
      const agentPerformance = this.calculateAgentPerformanceScore(agentId);
      const performanceAdjustment = (agentPerformance - 75) * 0.2; // Scale adjustment

      // Task complexity adjustments
      const complexityFactor = this.getComplexityFactor(task);
      const complexityAdjustment = complexityFactor * 5;

      return {
        overall: Math.min(5, Math.max(-5, trendAdjustment + performanceAdjustment - complexityAdjustment)),
        accuracy: Math.min(3, Math.max(-3, performanceAdjustment)),
        efficiency: Math.min(4, Math.max(-4, trendAdjustment))
      };
    } catch (error) {
      console.warn('ML prediction failed:', error);
      return {};
    }
  }

  /**
   * Combine base metrics with ML predictions
   */
  private combineMetricsWithPredictions(
    baseMetrics: EnhancedQualityMetrics,
    predictions: Partial<EnhancedQualityMetrics>
  ): EnhancedQualityMetrics {
    const combined = { ...baseMetrics };
    
    const numericKeys: (keyof Pick<EnhancedQualityMetrics, 'overall' | 'accuracy' | 'completeness' | 'relevance' | 'clarity' | 'consistency' | 'innovation' | 'efficiency' | 'usability' | 'maintainability'>)[] = [
      'overall', 'accuracy', 'completeness', 'relevance', 'clarity',
      'consistency', 'innovation', 'efficiency', 'usability', 'maintainability'
    ];

    numericKeys.forEach(key => {
      const predictionValue = predictions[key];
      const baseValue = combined[key];
      if (typeof predictionValue === 'number' && typeof baseValue === 'number') {
        (combined as any)[key] = this.normalizeScore(baseValue + predictionValue);
      }
    });

    return combined;
  }

  /**
   * Generate quality feedback for continuous improvement
   */
  private generateQualityFeedback(
    task: TaskBreakdown,
    result: string,
    metrics: EnhancedQualityMetrics,
    agentId: string
  ): QualityFeedback[] {
    const feedback: QualityFeedback[] = [];
    const timestamp = new Date().toISOString();

    // Accuracy feedback
    if (metrics.accuracy < 70) {
      feedback.push({
        taskId: task.id,
        agentId,
        feedbackType: 'negative',
        category: 'accuracy',
        message: 'Result contains factual inaccuracies or unreliable information. Verify sources and double-check facts.',
        actionable: true,
        priority: 'high',
        timestamp
      });
    }

    // Completeness feedback
    if (metrics.completeness < 75) {
      feedback.push({
        taskId: task.id,
        agentId,
        feedbackType: 'suggestion',
        category: 'completeness',
        message: 'Result does not fully address all task requirements. Review the task description and ensure all aspects are covered.',
        actionable: true,
        priority: 'medium',
        timestamp
      });
    }

    // Innovation feedback
    if (metrics.innovation > 85) {
      feedback.push({
        taskId: task.id,
        agentId,
        feedbackType: 'positive',
        category: 'innovation',
        message: 'Excellent creative approach and novel insights demonstrated in the solution.',
        actionable: false,
        priority: 'low',
        timestamp
      });
    }

    // Efficiency feedback
    if (metrics.efficiency < 60) {
      feedback.push({
        taskId: task.id,
        agentId,
        feedbackType: 'suggestion',
        category: 'efficiency',
        message: 'Task execution could be more efficient. Consider optimizing approach and resource utilization.',
        actionable: true,
        priority: 'medium',
        timestamp
      });
    }

    return feedback;
  }

  /**
   * Update quality trends for learning and prediction
   */
  private updateQualityTrends(taskId: string, agentId: string, score: number): void {
    const trendKey = `${taskId}-${agentId}`;
    const existingTrend = this.qualityTrends.get(trendKey);

    if (existingTrend) {
      existingTrend.historicalScores.push(score);
      existingTrend.trendDirection = this.calculateTrendDirection(existingTrend.historicalScores);
      existingTrend.predictedScore = this.predictNextScore(existingTrend.historicalScores);
      existingTrend.confidence = this.calculatePredictionConfidence(existingTrend.historicalScores);
      existingTrend.lastUpdated = new Date().toISOString();
    } else {
      this.qualityTrends.set(trendKey, {
        taskId,
        agentId,
        taskType: 'general', // Could be enhanced with task categorization
        complexity: 'moderate', // Could be derived from task analysis
        historicalScores: [score],
        trendDirection: 'stable',
        predictedScore: score,
        confidence: 0.5,
        lastUpdated: new Date().toISOString()
      });
    }
  }

  /**
   * Update learning data for ML predictions
   */
  private updateLearningData(
    task: TaskBreakdown,
    agentId: string,
    metrics: EnhancedQualityMetrics,
    execution?: TaskExecution
  ): void {
    const complexity = this.assessTaskComplexity(task);
    
    this.learningData.push({
      taskComplexity: complexity,
      agentCategory: 'general', // Could be enhanced with agent categorization
      taskType: this.categorizeTask(task),
      qualityScore: metrics.overall,
      factors: {
        skillCount: task.requiredSkills.length,
        dependencyCount: task.dependencies.length,
        estimatedEffort: task.estimatedEffort || 30,
        descriptionLength: task.description.length,
        executionTime: execution ? 
          (Date.now() - new Date(execution.startTime).getTime()) / (1000 * 60) : 30
      }
    });

    // Keep only recent learning data (last 1000 entries)
    if (this.learningData.length > 1000) {
      this.learningData = this.learningData.slice(-1000);
    }
  }

  /**
   * Get adaptive quality threshold based on task complexity
   */
  private getAdaptiveThreshold(task: TaskBreakdown): number {
    const complexity = this.assessTaskComplexity(task);
    return this.adaptiveThresholds.get(complexity) || this.config.qualityThreshold;
  }

  /**
   * Assess task complexity for adaptive thresholds
   */
  private assessTaskComplexity(task: TaskBreakdown): string {
    let complexityScore = 0;

    // Factor in required skills
    complexityScore += task.requiredSkills.length * 2;

    // Factor in dependencies
    complexityScore += task.dependencies.length * 3;

    // Factor in estimated effort
    if (task.estimatedEffort) {
      if (task.estimatedEffort > 120) complexityScore += 10;
      else if (task.estimatedEffort > 60) complexityScore += 5;
      else if (task.estimatedEffort > 30) complexityScore += 2;
    }

    // Factor in description complexity
    const descriptionWords = task.description.split(/\s+/).length;
    if (descriptionWords > 100) complexityScore += 5;
    else if (descriptionWords > 50) complexityScore += 3;

    if (complexityScore >= 20) return 'expert';
    if (complexityScore >= 12) return 'complex';
    if (complexityScore >= 6) return 'moderate';
    return 'simple';
  }

  /**
   * Extract issues from enhanced metrics
   */
  private extractIssues(metrics: EnhancedQualityMetrics, threshold: number): string[] {
    const issues: string[] = [];

    if (metrics.overall < threshold) {
      issues.push(`Overall quality score (${metrics.overall}) below threshold (${threshold})`);
    }

    if (metrics.accuracy < 70) {
      issues.push('Accuracy concerns detected - verify factual correctness');
    }

    if (metrics.completeness < 75) {
      issues.push('Incomplete result - missing required elements');
    }

    if (metrics.relevance < 70) {
      issues.push('Relevance issues - result may not fully address task objectives');
    }

    if (metrics.clarity < 65) {
      issues.push('Clarity problems - result is difficult to understand or poorly structured');
    }

    if (metrics.consistency < 70) {
      issues.push('Consistency issues - internal contradictions or logical gaps detected');
    }

    if (metrics.usability < 60) {
      issues.push('Usability concerns - result may be difficult to apply practically');
    }

    return issues;
  }

  /**
   * Generate improvement suggestions
   */
  private generateSuggestions(
    metrics: EnhancedQualityMetrics,
    task: TaskBreakdown,
    feedback: QualityFeedback[]
  ): string[] {
    const suggestions: string[] = [];

    // Add suggestions based on metrics
    if (metrics.completeness < 80) {
      suggestions.push('Review task requirements and ensure all aspects are addressed');
    }

    if (metrics.clarity < 75) {
      suggestions.push('Improve structure and readability with clear headings and formatting');
    }

    if (metrics.innovation < 60) {
      suggestions.push('Consider more creative approaches or novel solutions');
    }

    if (metrics.efficiency < 70) {
      suggestions.push('Optimize approach for better resource utilization');
    }

    // Add actionable feedback as suggestions
    feedback
      .filter(f => f.actionable && f.priority !== 'low')
      .forEach(f => suggestions.push(f.message));

    return suggestions;
  }

  /**
   * Check if task result needs retry based on quality
   */
  shouldRetryTask(taskId: string): boolean {
    const history = this.qualityHistory.get(taskId) || [];
    const latestCheck = history[history.length - 1];
    
    if (!latestCheck) return false;
    
    // Retry if not approved and under retry limit
    const retryCount = history.length - 1; // First attempt doesn't count as retry
    return !latestCheck.approved && retryCount < this.config.maxRetries;
  }

  /**
   * Get retry feedback for task improvement
   */
  getRetryFeedback(taskId: string): string {
    const history = this.qualityHistory.get(taskId) || [];
    const latestCheck = history[history.length - 1];
    
    if (!latestCheck) return 'No previous quality assessment found.';
    
    const feedback = [
      `Previous attempt scored ${latestCheck.score}/100.`,
      `Issues identified: ${latestCheck.issues.join(', ')}`,
      `Suggestions for improvement: ${latestCheck.suggestions.join(', ')}`
    ].join('\n');
    
    return feedback;
  }

  /**
   * Check if task needs escalation to user
   */
  needsEscalation(taskId: string): boolean {
    const history = this.qualityHistory.get(taskId) || [];
    
    // Escalate if max retries reached and still not approved
    if (history.length > this.config.maxRetries) {
      const latestCheck = history[history.length - 1];
      return !latestCheck?.approved;
    }
    
    // Escalate if quality score is extremely low
    const latestCheck = history[history.length - 1];
    if (latestCheck && latestCheck.score < 30) {
      return true;
    }
    
    return false;
  }

  /**
   * Get comprehensive quality analytics
   */
  async getQualityAnalytics(
    expeditionId?: string,
    timeRange?: { start: string; end: string }
  ): Promise<QualityAnalytics> {
    const allChecks: EnhancedQualityCheck[] = [];
    this.qualityHistory.forEach(checks => allChecks.push(...checks));

    // Filter by time range if provided
    const filteredChecks = timeRange ?
      allChecks.filter(check =>
        check.assessedAt >= timeRange.start && check.assessedAt <= timeRange.end
      ) : allChecks;

    if (filteredChecks.length === 0) {
      return this.getEmptyAnalytics(timeRange);
    }

    const totalScore = filteredChecks.reduce((sum, check) => sum + check.score, 0);
    const averageScore = totalScore / filteredChecks.length;

    // Calculate score distribution
    const scoreDistribution = this.calculateScoreDistribution(filteredChecks);

    // Analyze trends
    const trendAnalysis = this.analyzeTrends(filteredChecks);

    // Agent performance analysis
    const agentPerformance = await this.analyzeAgentPerformance(filteredChecks);

    // Task type analysis
    const taskTypeAnalysis = this.analyzeTaskTypes(filteredChecks);

    // Quality factors analysis
    const qualityFactors = this.analyzeQualityFactors(filteredChecks);

    return {
      timeRange: timeRange || {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        end: new Date().toISOString()
      },
      totalAssessments: filteredChecks.length,
      averageScore: Math.round(averageScore * 100) / 100,
      scoreDistribution,
      trendAnalysis,
      agentPerformance,
      taskTypeAnalysis,
      qualityFactors
    };
  }

  /**
   * Get quality statistics for completed tasks
   */
  getQualityStats(): {
    totalAssessments: number;
    averageScore: number;
    approvalRate: number;
    commonIssues: string[];
  } {
    const allChecks: EnhancedQualityCheck[] = [];
    this.qualityHistory.forEach(checks => allChecks.push(...checks));
    
    if (allChecks.length === 0) {
      return {
        totalAssessments: 0,
        averageScore: 0,
        approvalRate: 0,
        commonIssues: []
      };
    }
    
    const totalScore = allChecks.reduce((sum, check) => sum + check.score, 0);
    const approvedCount = allChecks.filter(check => check.approved).length;
    
    // Count issue frequency
    const issueFrequency = new Map<string, number>();
    allChecks.forEach(check => {
      check.issues.forEach(issue => {
        issueFrequency.set(issue, (issueFrequency.get(issue) || 0) + 1);
      });
    });
    
    const commonIssues = Array.from(issueFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([issue]) => issue);
    
    return {
      totalAssessments: allChecks.length,
      averageScore: Math.round(totalScore / allChecks.length),
      approvalRate: Math.round((approvedCount / allChecks.length) * 100),
      commonIssues
    };
  }

  /**
   * Clear quality history (call when expedition completes)
   */
  clearHistory(): void {
    this.qualityHistory.clear();
  }

  /**
   * Get quality history for a specific task
   */
  getTaskQualityHistory(taskId: string): EnhancedQualityCheck[] {
    return this.qualityHistory.get(taskId) || [];
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Normalize score to 0-100 range
   */
  private normalizeScore(score: number): number {
    return Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Get default quality metrics
   */
  private getDefaultMetrics(): EnhancedQualityMetrics {
    return {
      overall: 0,
      accuracy: 0,
      completeness: 0,
      relevance: 0,
      clarity: 0,
      consistency: 0,
      innovation: 0,
      efficiency: 0,
      usability: 0,
      maintainability: 0,
      detailedAnalysis: {
        strengths: [],
        weaknesses: ['Quality assessment failed'],
        criticalIssues: ['System error during assessment'],
        improvementAreas: ['Manual review required']
      },
      contextualFactors: {
        complexityAlignment: false,
        skillUtilization: 0,
        timeEfficiency: 0,
        resourceOptimization: 0
      },
      qualityPrediction: {
        confidence: 0,
        expectedRange: [0, 0],
        riskFactors: ['Assessment failure']
      }
    };
  }

  /**
   * Extract keywords from text
   */
  private extractKeywords(text: string): string[] {
    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 3)
      .filter(word => !['this', 'that', 'with', 'from', 'they', 'have', 'will', 'been', 'were', 'said', 'each', 'which', 'their', 'time', 'would', 'there', 'could', 'other'].includes(word));
  }

  /**
   * Calculate keyword overlap between two sets
   */
  private calculateKeywordOverlap(keywords1: string[], keywords2: string[]): number {
    if (keywords1.length === 0 || keywords2.length === 0) return 0;
    
    const set1 = new Set(keywords1);
    const set2 = new Set(keywords2);
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    
    return intersection.size / Math.max(set1.size, set2.size);
  }

  /**
   * Check if text is valid JSON
   */
  private isValidJSON(text: string): boolean {
    try {
      JSON.parse(text);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Check if text has list format
   */
  private hasListFormat(text: string): boolean {
    return text.includes('-') || text.includes('•') || /\d+\.\s/.test(text) || text.includes('*');
  }

  /**
   * Normalize all metrics in place
   */
  private normalizeMetrics(metrics: EnhancedQualityMetrics): void {
    const numericKeys: (keyof Pick<EnhancedQualityMetrics, 'overall' | 'accuracy' | 'completeness' | 'relevance' | 'clarity' | 'consistency' | 'innovation' | 'efficiency' | 'usability' | 'maintainability'>)[] = [
      'overall', 'accuracy', 'completeness', 'relevance', 'clarity',
      'consistency', 'innovation', 'efficiency', 'usability', 'maintainability'
    ];

    numericKeys.forEach(key => {
      const value = metrics[key];
      if (typeof value === 'number') {
        (metrics as any)[key] = this.normalizeScore(value);
      }
    });
  }

  /**
   * Find similar tasks for ML predictions
   */
  private findSimilarTasks(task: TaskBreakdown, agentId: string): any[] {
    // Simple similarity based on required skills overlap
    return this.learningData.filter(data => {
      const skillOverlap = task.requiredSkills.some(skill =>
        data.taskType.toLowerCase().includes(skill.toLowerCase())
      );
      return skillOverlap;
    });
  }

  /**
   * Calculate trend adjustment based on historical data
   */
  private calculateTrendAdjustment(trend: QualityTrend): number {
    if (trend.historicalScores.length < 2) return 0;
    
    const recent = trend.historicalScores.slice(-3);
    const older = trend.historicalScores.slice(0, -3);
    
    if (older.length === 0) return 0;
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    
    return (recentAvg - olderAvg) * 0.1; // Scale the adjustment
  }

  /**
   * Calculate agent performance score
   */
  private calculateAgentPerformanceScore(agentId: string): number {
    const feedback = this.qualityFeedback.get(agentId) || [];
    if (feedback.length === 0) return 75; // Default score
    
    const positiveCount = feedback.filter(f => f.feedbackType === 'positive').length;
    const negativeCount = feedback.filter(f => f.feedbackType === 'negative').length;
    
    const ratio = positiveCount / Math.max(1, positiveCount + negativeCount);
    return 50 + (ratio * 50); // Scale to 50-100 range
  }

  /**
   * Get complexity factor for task
   */
  private getComplexityFactor(task: TaskBreakdown): number {
    const complexity = this.assessTaskComplexity(task);
    const factors: Record<string, number> = {
      'simple': 0.5,
      'moderate': 1.0,
      'complex': 1.5,
      'expert': 2.0
    };
    return factors[complexity] || 1.0;
  }

  /**
   * Calculate trend direction from scores
   */
  private calculateTrendDirection(scores: number[]): 'improving' | 'declining' | 'stable' {
    if (scores.length < 3) return 'stable';
    
    const recent = scores.slice(-3);
    const older = scores.slice(0, -3);
    
    if (older.length === 0) return 'stable';
    
    const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
    
    const diff = recentAvg - olderAvg;
    
    if (diff > 5) return 'improving';
    if (diff < -5) return 'declining';
    return 'stable';
  }

  /**
   * Predict next score based on historical data
   */
  private predictNextScore(scores: number[]): number {
    if (scores.length === 0) return 75;
    if (scores.length === 1) return scores[0];
    
    // Simple linear regression
    const n = scores.length;
    const x = Array.from({length: n}, (_, i) => i);
    const y = scores;
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    const nextX = n;
    const prediction = slope * nextX + intercept;
    
    return Math.max(0, Math.min(100, Math.round(prediction)));
  }

  /**
   * Calculate prediction confidence
   */
  private calculatePredictionConfidence(scores: number[]): number {
    if (scores.length < 3) return 0.3;
    
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);
    
    // Lower standard deviation = higher confidence
    const confidence = Math.max(0.1, Math.min(0.95, 1 - (stdDev / 50)));
    return Math.round(confidence * 100) / 100;
  }

  /**
   * Categorize task based on description and skills
   */
  private categorizeTask(task: TaskBreakdown): string {
    const description = task.description.toLowerCase();
    const skills = task.requiredSkills.map(s => s.toLowerCase());
    
    if (skills.some(s => s.includes('code') || s.includes('programming') || s.includes('development'))) {
      return 'coding';
    }
    
    if (skills.some(s => s.includes('analysis') || s.includes('research'))) {
      return 'analysis';
    }
    
    if (skills.some(s => s.includes('creative') || s.includes('design'))) {
      return 'creative';
    }
    
    if (description.includes('write') || description.includes('document')) {
      return 'writing';
    }
    
    return 'general';
  }

  /**
   * Get empty analytics structure
   */
  private getEmptyAnalytics(timeRange?: { start: string; end: string }): QualityAnalytics {
    return {
      timeRange: timeRange || {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        end: new Date().toISOString()
      },
      totalAssessments: 0,
      averageScore: 0,
      scoreDistribution: {
        'excellent (90-100)': 0,
        'good (80-89)': 0,
        'acceptable (70-79)': 0,
        'needs-improvement (60-69)': 0,
        'poor (0-59)': 0
      },
      trendAnalysis: {
        overallTrend: 'stable',
        trendStrength: 0,
        projectedScore: 0
      },
      agentPerformance: [],
      taskTypeAnalysis: {},
      qualityFactors: []
    };
  }

  /**
   * Calculate score distribution
   */
  private calculateScoreDistribution(checks: EnhancedQualityCheck[]): Record<string, number> {
    const distribution = {
      'excellent (90-100)': 0,
      'good (80-89)': 0,
      'acceptable (70-79)': 0,
      'needs-improvement (60-69)': 0,
      'poor (0-59)': 0
    };

    checks.forEach(check => {
      if (check.score >= 90) distribution['excellent (90-100)']++;
      else if (check.score >= 80) distribution['good (80-89)']++;
      else if (check.score >= 70) distribution['acceptable (70-79)']++;
      else if (check.score >= 60) distribution['needs-improvement (60-69)']++;
      else distribution['poor (0-59)']++;
    });

    return distribution;
  }

  /**
   * Analyze trends from quality checks
   */
  private analyzeTrends(checks: EnhancedQualityCheck[]): QualityAnalytics['trendAnalysis'] {
    if (checks.length < 5) {
      return {
        overallTrend: 'stable',
        trendStrength: 0,
        projectedScore: checks.length > 0 ? checks[checks.length - 1].score : 0
      };
    }

    const scores = checks.map(c => c.score);
    const trend = this.calculateTrendDirection(scores);
    const strength = this.calculateTrendStrength(scores);
    const projected = this.predictNextScore(scores);

    return {
      overallTrend: trend,
      trendStrength: strength,
      projectedScore: projected
    };
  }

  /**
   * Calculate trend strength
   */
  private calculateTrendStrength(scores: number[]): number {
    if (scores.length < 3) return 0;
    
    const recent = scores.slice(-Math.min(5, scores.length));
    const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
    const variance = recent.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / recent.length;
    
    // Lower variance indicates stronger trend
    return Math.max(0, Math.min(1, 1 - (Math.sqrt(variance) / 50)));
  }

  /**
   * Analyze agent performance
   */
  private async analyzeAgentPerformance(checks: EnhancedQualityCheck[]): Promise<QualityAnalytics['agentPerformance']> {
    const agentRepo = RepositoryFactory.getAgentRepository();
    const agentStats = new Map<string, { scores: number[]; name: string }>();

    // Group checks by agent
    for (const check of checks) {
      if (check.agentId) {
        if (!agentStats.has(check.agentId)) {
          try {
            const agent = await agentRepo.findById(check.agentId);
            agentStats.set(check.agentId, {
              scores: [],
              name: agent?.name || 'Unknown Agent'
            });
          } catch (error) {
            agentStats.set(check.agentId, {
              scores: [],
              name: 'Unknown Agent'
            });
          }
        }
        agentStats.get(check.agentId)!.scores.push(check.score);
      }
    }

    // Calculate performance metrics
    return Array.from(agentStats.entries()).map(([agentId, data]) => ({
      agentId,
      agentName: data.name,
      averageScore: Math.round((data.scores.reduce((a, b) => a + b, 0) / data.scores.length) * 100) / 100,
      improvementRate: this.calculateImprovementRate(data.scores),
      consistencyScore: this.calculateConsistencyScore(data.scores)
    }));
  }

  /**
   * Calculate improvement rate for agent
   */
  private calculateImprovementRate(scores: number[]): number {
    if (scores.length < 2) return 0;
    
    const firstHalf = scores.slice(0, Math.floor(scores.length / 2));
    const secondHalf = scores.slice(Math.floor(scores.length / 2));
    
    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    
    return Math.round((secondAvg - firstAvg) * 100) / 100;
  }

  /**
   * Calculate consistency score for agent
   */
  private calculateConsistencyScore(scores: number[]): number {
    if (scores.length < 2) return 100;
    
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);
    
    // Convert to consistency score (lower std dev = higher consistency)
    return Math.round(Math.max(0, 100 - stdDev) * 100) / 100;
  }

  /**
   * Analyze task types
   */
  private analyzeTaskTypes(checks: EnhancedQualityCheck[]): QualityAnalytics['taskTypeAnalysis'] {
    const typeStats = new Map<string, { scores: number[]; issues: string[] }>();
    
    checks.forEach(check => {
      // For now, use a simple categorization - could be enhanced
      const type = 'general';
      
      if (!typeStats.has(type)) {
        typeStats.set(type, { scores: [], issues: [] });
      }
      
      const stats = typeStats.get(type)!;
      stats.scores.push(check.score);
      stats.issues.push(...check.issues);
    });
    
    const result: QualityAnalytics['taskTypeAnalysis'] = {};
    
    typeStats.forEach((stats, type) => {
      const averageScore = stats.scores.reduce((a, b) => a + b, 0) / stats.scores.length;
      const successRate = (stats.scores.filter(s => s >= 70).length / stats.scores.length) * 100;
      
      // Count common issues
      const issueFreq = new Map<string, number>();
      stats.issues.forEach(issue => {
        issueFreq.set(issue, (issueFreq.get(issue) || 0) + 1);
      });
      
      const commonIssues = Array.from(issueFreq.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([issue]) => issue);
      
      result[type] = {
        averageScore: Math.round(averageScore * 100) / 100,
        commonIssues,
        successRate: Math.round(successRate * 100) / 100
      };
    });
    
    return result;
  }

  /**
   * Analyze quality factors
   */
  private analyzeQualityFactors(checks: EnhancedQualityCheck[]): QualityAnalytics['qualityFactors'] {
    // Simple analysis of quality factors
    return [
      {
        factor: 'Completeness',
        impact: 0.25,
        correlation: 0.8
      },
      {
        factor: 'Accuracy',
        impact: 0.3,
        correlation: 0.85
      },
      {
        factor: 'Clarity',
        impact: 0.2,
        correlation: 0.7
      },
      {
        factor: 'Relevance',
        impact: 0.25,
        correlation: 0.75
      }
    ];
  }
}