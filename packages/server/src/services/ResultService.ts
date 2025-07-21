/**
 * Result Service - Result and Quality Management Layer
 * 
 * Handles all business logic for expedition results including creation, validation,
 * quality scoring, analytics, and integration with task completion workflows.
 */

import { 
  ExpeditionResult,
  ResultType,
  ResultFormat,
  QualityScore,
  CreateResultRequest,
  ExpeditionError,
  ExpeditionErrorCode
} from '@starships/protocol';
import { RepositoryFactory } from '@starships/models';
import { SocketIOService } from './SocketIOService';

export interface UpdateResultRequest {
  title?: string;
  description?: string;
  content?: string;
  resultType?: ResultType;
  format?: ResultFormat;
  attachments?: string[];
  metadata?: Record<string, any>;
}

export interface QualityAssessmentRequest {
  resultId: string;
  assessorId: string;
  overall: number;
  completeness: number;
  accuracy: number;
  relevance: number;
  clarity: number;
  notes?: string;
}

export interface ResultFilters {
  resultType?: ResultType[];
  format?: ResultFormat[];
  createdBy?: string;
  qualityRange?: {
    min: number;
    max: number;
  };
  dateRange?: {
    start: string;
    end: string;
  };
  search?: string;
}

export interface ResultAnalytics {
  totalResults: number;
  resultsByType: Record<ResultType, number>;
  resultsByFormat: Record<ResultFormat, number>;
  averageQuality: number;
  qualityDistribution: {
    excellent: number; // 90-100
    good: number;      // 70-89
    fair: number;      // 50-69
    poor: number;      // 0-49
  };
  topPerformers: Array<{
    createdBy: string;
    resultCount: number;
    averageQuality: number;
  }>;
  recentTrends: {
    period: string;
    resultCount: number;
    qualityTrend: 'improving' | 'declining' | 'stable';
  };
}

export interface ResultInsight {
  type: 'quality_improvement' | 'performance_trend' | 'content_analysis' | 'recommendation';
  title: string;
  description: string;
  data: Record<string, any>;
  actionable: boolean;
  priority: 'low' | 'medium' | 'high';
}

export class ResultService {
  private static instance: ResultService;

  private constructor() {}

  /**
   * Safely get SocketIOService instance with lazy initialization
   */
  private getSocketService(): SocketIOService | null {
    try {
      return SocketIOService.getInstance();
    } catch (error) {
      console.warn('[RESULT-SERVICE] SocketIOService not yet initialized');
      return null;
    }
  }

  static getInstance(): ResultService {
    if (!ResultService.instance) {
      ResultService.instance = new ResultService();
    }
    return ResultService.instance;
  }

  /**
   * Create a new expedition result
   */
  async createResult(
    userId: string,
    request: CreateResultRequest
  ): Promise<ExpeditionResult> {
    console.log(`[RESULT-SERVICE] Creating result for expedition: ${request.expeditionId}`);

    try {
      // Validate expedition access
      await this.validateExpeditionAccess(request.expeditionId, userId);

      // Validate result content
      this.validateResultContent(request);

      // Generate initial quality score
      const initialQuality = await this.generateInitialQualityScore(request, userId);

      // Create result
      const resultRepo = RepositoryFactory.getExpeditionResultRepository();
      const result = await resultRepo.create({
        expeditionId: request.expeditionId,
        title: request.title,
        description: request.description,
        content: request.content,
        resultType: request.resultType,
        format: request.format,
        quality: initialQuality,
        createdBy: userId,
        updatedAt: new Date().toISOString(),
        attachments: request.attachments || [],
        metadata: request.metadata || {}
      });

      // Emit real-time event
      const socketService = this.getSocketService();
      if (socketService) {
        socketService.emitToUser(userId, 'expedition:result-available', {
          expeditionId: request.expeditionId,
          resultId: result.id,
          result: {
            id: result.id,
            title: result.title,
            description: result.description,
            resultType: result.resultType,
            format: result.format,
            createdBy: result.createdBy,
            createdAt: result.createdAt,
            quality: {
              overall: result.quality.overall,
              completeness: result.quality.completeness,
              accuracy: result.quality.accuracy,
              relevance: result.quality.relevance,
              clarity: result.quality.clarity
            }
          },
          timestamp: new Date().toISOString()
        });
      }

      console.log(`[RESULT-SERVICE] Result created: ${result.id}`);
      return result;
    } catch (error) {
      console.error('[RESULT-SERVICE] Failed to create result:', error);
      throw this.handleError(error, 'CREATE_RESULT_FAILED');
    }
  }

  /**
   * Get result by ID
   */
  async getResult(resultId: string, userId: string): Promise<ExpeditionResult> {
    try {
      const resultRepo = RepositoryFactory.getExpeditionResultRepository();
      const result = await resultRepo.findById(resultId);

      if (!result) {
        throw this.createError('VALIDATION_ERROR', `Result not found: ${resultId}`);
      }

      // Validate expedition access
      await this.validateExpeditionAccess(result.expeditionId, userId);

      return result;
    } catch (error) {
      console.error('[RESULT-SERVICE] Failed to get result:', error);
      throw this.handleError(error, 'GET_RESULT_FAILED');
    }
  }

  /**
   * Get results for an expedition
   */
  async getExpeditionResults(
    expeditionId: string,
    userId: string,
    filters?: ResultFilters
  ): Promise<ExpeditionResult[]> {
    try {
      // Validate expedition access
      await this.validateExpeditionAccess(expeditionId, userId);

      const resultRepo = RepositoryFactory.getExpeditionResultRepository();
      let results = await resultRepo.findByExpedition(expeditionId);

      // Apply filters
      if (filters) {
        results = this.applyResultFilters(results, filters);
      }

      return results.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch (error) {
      console.error('[RESULT-SERVICE] Failed to get expedition results:', error);
      throw this.handleError(error, 'GET_RESULTS_FAILED');
    }
  }

  /**
   * Update result
   */
  async updateResult(
    resultId: string,
    userId: string,
    updates: UpdateResultRequest
  ): Promise<ExpeditionResult> {
    try {
      const resultRepo = RepositoryFactory.getExpeditionResultRepository();
      const result = await resultRepo.findById(resultId);

      if (!result) {
        throw this.createError('VALIDATION_ERROR', `Result not found: ${resultId}`);
      }

      // Validate expedition access
      await this.validateExpeditionAccess(result.expeditionId, userId);

      // Validate update permissions
      this.validateResultUpdatePermissions(result, userId);

      // Update result
      const updatedResult = await resultRepo.update(resultId, {
        ...updates,
        updatedAt: new Date().toISOString()
      });

      if (!updatedResult) {
        throw this.createError('UPDATE_FAILED', 'Failed to update result');
      }

      // Recalculate quality score if content changed
      if (updates.content) {
        const newQuality = await this.recalculateQualityScore(updatedResult);
        await resultRepo.update(resultId, { quality: newQuality });
        updatedResult.quality = newQuality;
      }

      // Emit real-time event
      const socketService = this.getSocketService();
      if (socketService) {
        socketService.emitToUser(userId, 'expedition:result-available', {
          expeditionId: result.expeditionId,
          resultId: updatedResult.id,
          result: {
            id: updatedResult.id,
            title: updatedResult.title,
            description: updatedResult.description,
            resultType: updatedResult.resultType,
            format: updatedResult.format,
            createdBy: updatedResult.createdBy,
            createdAt: updatedResult.createdAt,
            quality: {
              overall: updatedResult.quality.overall,
              completeness: updatedResult.quality.completeness,
              accuracy: updatedResult.quality.accuracy,
              relevance: updatedResult.quality.relevance,
              clarity: updatedResult.quality.clarity
            }
          },
          timestamp: new Date().toISOString()
        });
      }

      console.log(`[RESULT-SERVICE] Result updated: ${resultId}`);
      return updatedResult;
    } catch (error) {
      console.error('[RESULT-SERVICE] Failed to update result:', error);
      throw this.handleError(error, 'UPDATE_RESULT_FAILED');
    }
  }

  /**
   * Delete result
   */
  async deleteResult(resultId: string, userId: string): Promise<void> {
    try {
      const resultRepo = RepositoryFactory.getExpeditionResultRepository();
      const result = await resultRepo.findById(resultId);

      if (!result) {
        throw this.createError('VALIDATION_ERROR', `Result not found: ${resultId}`);
      }

      // Validate expedition access
      await this.validateExpeditionAccess(result.expeditionId, userId);

      // Validate delete permissions
      this.validateResultDeletePermissions(result, userId);

      // Delete result
      await resultRepo.delete(resultId);

      // Emit real-time event
      const socketService = this.getSocketService();
      if (socketService) {
        socketService.emitToUser(userId, 'expedition:updated', {
          expeditionId: result.expeditionId,
          changes: {
            status: 'Result deleted'
          },
          updatedBy: userId,
          timestamp: new Date().toISOString()
        });
      }

      console.log(`[RESULT-SERVICE] Result deleted: ${resultId}`);
    } catch (error) {
      console.error('[RESULT-SERVICE] Failed to delete result:', error);
      throw this.handleError(error, 'DELETE_RESULT_FAILED');
    }
  }

  /**
   * Assess result quality
   */
  async assessQuality(
    userId: string,
    assessment: QualityAssessmentRequest
  ): Promise<ExpeditionResult> {
    try {
      const resultRepo = RepositoryFactory.getExpeditionResultRepository();
      const result = await resultRepo.findById(assessment.resultId);

      if (!result) {
        throw this.createError('VALIDATION_ERROR', `Result not found: ${assessment.resultId}`);
      }

      // Validate expedition access
      await this.validateExpeditionAccess(result.expeditionId, userId);

      // Validate quality scores
      this.validateQualityScores(assessment);

      // Create new quality score
      const newQuality: QualityScore = {
        overall: assessment.overall,
        completeness: assessment.completeness,
        accuracy: assessment.accuracy,
        relevance: assessment.relevance,
        clarity: assessment.clarity,
        assessedBy: assessment.assessorId,
        assessedAt: new Date().toISOString(),
        notes: assessment.notes
      };

      // Update result with new quality score
      const updatedResult = await resultRepo.update(assessment.resultId, {
        quality: newQuality,
        updatedAt: new Date().toISOString()
      });

      if (!updatedResult) {
        throw this.createError('UPDATE_FAILED', 'Failed to update quality score');
      }

      // Emit real-time event
      const socketService = this.getSocketService();
      if (socketService) {
        socketService.emitToUser(userId, 'expedition:result-available', {
          expeditionId: result.expeditionId,
          resultId: assessment.resultId,
          result: {
            id: updatedResult.id,
            title: updatedResult.title,
            description: updatedResult.description,
            resultType: updatedResult.resultType,
            format: updatedResult.format,
            createdBy: updatedResult.createdBy,
            createdAt: updatedResult.createdAt,
            quality: newQuality
          },
          timestamp: new Date().toISOString()
        });
      }

      console.log(`[RESULT-SERVICE] Quality assessed for result: ${assessment.resultId}`);
      return updatedResult;
    } catch (error) {
      console.error('[RESULT-SERVICE] Failed to assess quality:', error);
      throw this.handleError(error, 'ASSESS_QUALITY_FAILED');
    }
  }

  /**
   * Get result analytics for an expedition
   */
  async getResultAnalytics(
    expeditionId: string,
    userId: string
  ): Promise<ResultAnalytics> {
    try {
      // Validate expedition access
      await this.validateExpeditionAccess(expeditionId, userId);

      const resultRepo = RepositoryFactory.getExpeditionResultRepository();
      const results = await resultRepo.findByExpedition(expeditionId);

      // Calculate analytics
      const analytics: ResultAnalytics = {
        totalResults: results.length,
        resultsByType: this.calculateResultsByType(results),
        resultsByFormat: this.calculateResultsByFormat(results),
        averageQuality: this.calculateAverageQuality(results),
        qualityDistribution: this.calculateQualityDistribution(results),
        topPerformers: this.calculateTopPerformers(results),
        recentTrends: this.calculateRecentTrends(results)
      };

      return analytics;
    } catch (error) {
      console.error('[RESULT-SERVICE] Failed to get result analytics:', error);
      throw this.handleError(error, 'GET_ANALYTICS_FAILED');
    }
  }

  /**
   * Generate insights from results
   */
  async generateInsights(
    expeditionId: string,
    userId: string
  ): Promise<ResultInsight[]> {
    try {
      // Validate expedition access
      await this.validateExpeditionAccess(expeditionId, userId);

      const resultRepo = RepositoryFactory.getExpeditionResultRepository();
      const results = await resultRepo.findByExpedition(expeditionId);

      const insights: ResultInsight[] = [];

      // Quality improvement insights
      const qualityInsights = this.generateQualityInsights(results);
      insights.push(...qualityInsights);

      // Performance trend insights
      const performanceInsights = this.generatePerformanceInsights(results);
      insights.push(...performanceInsights);

      // Content analysis insights
      const contentInsights = this.generateContentInsights(results);
      insights.push(...contentInsights);

      // Recommendation insights
      const recommendationInsights = this.generateRecommendationInsights(results);
      insights.push(...recommendationInsights);

      return insights.sort((a, b) => {
        const priorityOrder = { 'high': 0, 'medium': 1, 'low': 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
    } catch (error) {
      console.error('[RESULT-SERVICE] Failed to generate insights:', error);
      throw this.handleError(error, 'GENERATE_INSIGHTS_FAILED');
    }
  }

  /**
   * Validate result against task requirements
   */
  async validateResultAgainstTask(
    resultId: string,
    taskId: string,
    userId: string
  ): Promise<{
    isValid: boolean;
    score: number;
    issues: string[];
    recommendations: string[];
  }> {
    try {
      const resultRepo = RepositoryFactory.getExpeditionResultRepository();
      const taskRepo = RepositoryFactory.getExpeditionTaskRepository();

      const [result, task] = await Promise.all([
        resultRepo.findById(resultId),
        taskRepo.findById(taskId)
      ]);

      if (!result) {
        throw this.createError('VALIDATION_ERROR', `Result not found: ${resultId}`);
      }

      if (!task) {
        throw this.createError('VALIDATION_ERROR', `Task not found: ${taskId}`);
      }

      // Validate expedition access
      await this.validateExpeditionAccess(result.expeditionId, userId);

      // Perform validation
      const validation = this.performTaskResultValidation(result, task);

      return validation;
    } catch (error) {
      console.error('[RESULT-SERVICE] Failed to validate result against task:', error);
      throw this.handleError(error, 'VALIDATE_RESULT_FAILED');
    }
  }

  // Private helper methods

  private async validateExpeditionAccess(expeditionId: string, userId: string): Promise<void> {
    const expeditionRepo = RepositoryFactory.getExpeditionRepository();
    const expedition = await expeditionRepo.findById(expeditionId);

    if (!expedition) {
      throw this.createError('EXPEDITION_NOT_FOUND', `Expedition not found: ${expeditionId}`);
    }

    // Validate starship ownership
    const starshipRepo = RepositoryFactory.getStarshipRepository();
    const starship = await starshipRepo.findById(expedition.starshipId);

    if (!starship || starship.ownerId !== userId) {
      throw this.createError('EXPEDITION_ACCESS_DENIED', 'Access denied to expedition');
    }
  }

  private validateResultContent(request: CreateResultRequest): void {
    if (!request.content || request.content.trim().length === 0) {
      throw this.createError('VALIDATION_ERROR', 'Result content cannot be empty');
    }

    if (request.content.length > 1000000) { // 1MB limit
      throw this.createError('VALIDATION_ERROR', 'Result content exceeds size limit');
    }
  }

  private validateResultUpdatePermissions(result: ExpeditionResult, userId: string): void {
    // Only the creator can update the result
    if (result.createdBy !== userId) {
      throw this.createError('EXPEDITION_ACCESS_DENIED', 'Cannot update another user\'s result');
    }
  }

  private validateResultDeletePermissions(result: ExpeditionResult, userId: string): void {
    // Only the creator can delete the result
    if (result.createdBy !== userId) {
      throw this.createError('EXPEDITION_ACCESS_DENIED', 'Cannot delete another user\'s result');
    }
  }

  private validateQualityScores(assessment: QualityAssessmentRequest): void {
    const scores = [
      assessment.overall,
      assessment.completeness,
      assessment.accuracy,
      assessment.relevance,
      assessment.clarity
    ];

    for (const score of scores) {
      if (score < 0 || score > 100) {
        throw this.createError('VALIDATION_ERROR', 'Quality scores must be between 0 and 100');
      }
    }
  }

  private async generateInitialQualityScore(
    request: CreateResultRequest,
    userId: string
  ): Promise<QualityScore> {
    // Simple heuristic-based initial scoring
    const contentLength = request.content.length;
    const hasDescription = request.description && request.description.length > 0;
    const hasAttachments = request.attachments && request.attachments.length > 0;

    let completeness = Math.min(100, (contentLength / 1000) * 50);
    if (hasDescription) completeness += 20;
    if (hasAttachments) completeness += 10;

    const overall = Math.min(100, completeness * 0.8); // Conservative initial score

    return {
      overall: Math.round(overall),
      completeness: Math.round(completeness),
      accuracy: 75, // Default neutral score
      relevance: 80, // Assume relevant since it's created for the expedition
      clarity: Math.min(100, (contentLength / 500) * 60), // Based on content length
      assessedBy: 'system',
      assessedAt: new Date().toISOString(),
      notes: 'Initial automated assessment'
    };
  }

  private async recalculateQualityScore(result: ExpeditionResult): Promise<QualityScore> {
    // Recalculate based on updated content
    const contentLength = result.content.length;
    const hasDescription = result.description && result.description.length > 0;
    const hasAttachments = result.attachments && result.attachments.length > 0;

    let completeness = Math.min(100, (contentLength / 1000) * 50);
    if (hasDescription) completeness += 20;
    if (hasAttachments) completeness += 10;

    // Keep existing human assessments for other metrics
    const existingQuality = result.quality;
    
    return {
      overall: Math.round((completeness + existingQuality.accuracy + existingQuality.relevance + existingQuality.clarity) / 4),
      completeness: Math.round(completeness),
      accuracy: existingQuality.accuracy,
      relevance: existingQuality.relevance,
      clarity: existingQuality.clarity,
      assessedBy: 'system',
      assessedAt: new Date().toISOString(),
      notes: 'Recalculated after content update'
    };
  }

  private applyResultFilters(results: ExpeditionResult[], filters: ResultFilters): ExpeditionResult[] {
    return results.filter(result => {
      if (filters.resultType && !filters.resultType.includes(result.resultType)) return false;
      if (filters.format && !filters.format.includes(result.format)) return false;
      if (filters.createdBy && result.createdBy !== filters.createdBy) return false;
      
      if (filters.qualityRange) {
        const quality = result.quality.overall;
        if (quality < filters.qualityRange.min || quality > filters.qualityRange.max) return false;
      }
      
      if (filters.dateRange) {
        const resultTime = new Date(result.createdAt).getTime();
        const startTime = new Date(filters.dateRange.start).getTime();
        const endTime = new Date(filters.dateRange.end).getTime();
        if (resultTime < startTime || resultTime > endTime) return false;
      }
      
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const searchableText = `${result.title} ${result.description} ${result.content}`.toLowerCase();
        if (!searchableText.includes(searchLower)) return false;
      }
      
      return true;
    });
  }

  private calculateResultsByType(results: ExpeditionResult[]): Record<ResultType, number> {
    const counts: Record<ResultType, number> = {
      'final-report': 0,
      'task-output': 0,
      'analysis': 0,
      'code': 0,
      'document': 0,
      'design': 0,
      'data': 0,
      'recommendation': 0
    };

    results.forEach(result => {
      counts[result.resultType]++;
    });

    return counts;
  }

  private calculateResultsByFormat(results: ExpeditionResult[]): Record<ResultFormat, number> {
    const counts: Record<ResultFormat, number> = {
      'text': 0,
      'markdown': 0,
      'json': 0,
      'code': 0,
      'html': 0,
      'pdf': 0,
      'image': 0,
      'video': 0,
      'audio': 0,
      'archive': 0
    };

    results.forEach(result => {
      counts[result.format]++;
    });

    return counts;
  }

  private calculateAverageQuality(results: ExpeditionResult[]): number {
    if (results.length === 0) return 0;
    
    const totalQuality = results.reduce((sum, result) => sum + result.quality.overall, 0);
    return Math.round(totalQuality / results.length);
  }

  private calculateQualityDistribution(results: ExpeditionResult[]): {
    excellent: number;
    good: number;
    fair: number;
    poor: number;
  } {
    const distribution = { excellent: 0, good: 0, fair: 0, poor: 0 };
    
    results.forEach(result => {
      const quality = result.quality.overall;
      if (quality >= 90) distribution.excellent++;
      else if (quality >= 70) distribution.good++;
      else if (quality >= 50) distribution.fair++;
      else distribution.poor++;
    });

    return distribution;
  }

  private calculateTopPerformers(results: ExpeditionResult[]): Array<{
    createdBy: string;
    resultCount: number;
    averageQuality: number;
  }> {
    const performerMap = new Map<string, { count: number; totalQuality: number }>();
    
    results.forEach(result => {
      const creator = result.createdBy;
      if (!performerMap.has(creator)) {
        performerMap.set(creator, { count: 0, totalQuality: 0 });
      }
      
      const performer = performerMap.get(creator)!;
      performer.count++;
      performer.totalQuality += result.quality.overall;
    });

    return Array.from(performerMap.entries())
      .map(([createdBy, data]) => ({
        createdBy,
        resultCount: data.count,
        averageQuality: Math.round(data.totalQuality / data.count)
      }))
      .sort((a, b) => b.averageQuality - a.averageQuality)
      .slice(0, 5);
  }

  private calculateRecentTrends(results: ExpeditionResult[]): {
    period: string;
    resultCount: number;
    qualityTrend: 'improving' | 'declining' | 'stable';
  } {
    const now = new Date();
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const recentResults = results.filter(result => 
      new Date(result.createdAt) >= lastWeek
    );

    // Simple trend calculation
    const firstHalf = recentResults.slice(0, Math.floor(recentResults.length / 2));
    const secondHalf = recentResults.slice(Math.floor(recentResults.length / 2));
    
    const firstHalfAvg = firstHalf.length > 0 ? 
      firstHalf.reduce((sum, r) => sum + r.quality.overall, 0) / firstHalf.length : 0;
    const secondHalfAvg = secondHalf.length > 0 ? 
      secondHalf.reduce((sum, r) => sum + r.quality.overall, 0) / secondHalf.length : 0;
    
    let qualityTrend: 'improving' | 'declining' | 'stable' = 'stable';
    if (secondHalfAvg > firstHalfAvg + 5) qualityTrend = 'improving';
    else if (secondHalfAvg < firstHalfAvg - 5) qualityTrend = 'declining';

    return {
      period: 'Last 7 days',
      resultCount: recentResults.length,
      qualityTrend
    };
  }

  private generateQualityInsights(results: ExpeditionResult[]): ResultInsight[] {
    const insights: ResultInsight[] = [];
    
    const avgQuality = this.calculateAverageQuality(results);
    
    if (avgQuality < 70) {
      insights.push({
        type: 'quality_improvement',
        title: 'Quality Below Target',
        description: `Average result quality is ${avgQuality}%, below the recommended 70% threshold.`,
        data: { averageQuality: avgQuality, target: 70 },
        actionable: true,
        priority: 'high'
      });
    }

    return insights;
  }

  private generatePerformanceInsights(results: ExpeditionResult[]): ResultInsight[] {
    const insights: ResultInsight[] = [];
    
    const trends = this.calculateRecentTrends(results);
    
    if (trends.qualityTrend === 'declining') {
      insights.push({
        type: 'performance_trend',
        title: 'Declining Quality Trend',
        description: `Result quality has been declining over the ${trends.period}.`,
        data: { trend: trends.qualityTrend, period: trends.period },
        actionable: true,
        priority: 'medium'
      });
    }

    return insights;
  }

  private generateContentInsights(results: ExpeditionResult[]): ResultInsight[] {
    const insights: ResultInsight[] = [];
    
    const typeDistribution = this.calculateResultsByType(results);
    const mostCommonType = Object.entries(typeDistribution)
      .sort(([,a], [,b]) => b - a)[0];
    
    if (mostCommonType && mostCommonType[1] > results.length * 0.6) {
      insights.push({
        type: 'content_analysis',
        title: 'Result Type Concentration',
        description: `${Math.round((mostCommonType[1] / results.length) * 100)}% of results are of type "${mostCommonType[0]}".`,
        data: { dominantType: mostCommonType[0], percentage: (mostCommonType[1] / results.length) * 100 },
        actionable: false,
        priority: 'low'
      });
    }

    return insights;
  }

  private generateRecommendationInsights(results: ExpeditionResult[]): ResultInsight[] {
    const insights: ResultInsight[] = [];
    
    const distribution = this.calculateQualityDistribution(results);
    
    if (distribution.poor > 0) {
      insights.push({
        type: 'recommendation',
        title: 'Quality Improvement Needed',
        description: `${distribution.poor} results have poor quality scores. Consider additional review processes.`,
        data: { poorQualityCount: distribution.poor, totalResults: results.length },
        actionable: true,
        priority: 'medium'
      });
    }

    return insights;
  }

  private performTaskResultValidation(result: ExpeditionResult, task: any): {
    isValid: boolean;
    score: number;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    // Check if result type matches task deliverable expectations
    if (task.deliverable && !result.content.toLowerCase().includes(task.deliverable.toLowerCase())) {
      issues.push('Result content may not fully address the task deliverable requirements');
      score -= 20;
    }

    // Check content length appropriateness
    if (result.content.length < 100) {
      issues.push('Result content appears too brief for the task complexity');
      score -= 15;
      recommendations.push('Consider providing more detailed explanations or examples');
    }

    // Check quality score
    if (result.quality.overall < 70) {
      issues.push('Result quality score is below acceptable threshold');
      score -= 10;
      recommendations.push('Review and improve result quality before submission');
    }

    return {
      isValid: score >= 70,
      score: Math.max(0, score),
      issues,
      recommendations
    };
  }

  private createError(code: ExpeditionErrorCode, message: string): ExpeditionError {
    return {
      code,
      message,
      details: undefined
    };
  }

  private handleError(error: any, fallbackCode: string): ExpeditionError {
    if (error.code) {
      return error;
    }

    return {
      code: fallbackCode as ExpeditionErrorCode,
      message: error.message || 'Unknown error occurred',
      details: error
    };
  }
}