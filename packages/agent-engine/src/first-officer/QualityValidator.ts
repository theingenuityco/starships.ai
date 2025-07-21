/**
 * Quality Validation System
 * 
 * Implements quality control for expedition task results with automated
 * assessment, retry logic, and escalation mechanisms.
 */

import { TaskBreakdown } from '@starships/protocol';
import { ProviderFactory } from '../llm/provider-factory';
import { buildPrompt } from '../prompt/builder';
import {
  QualityCheck,
  CompletedTask,
  FirstOfficerConfig
} from './types';

export class QualityValidator {
  private config: FirstOfficerConfig;
  private qualityHistory: Map<string, QualityCheck[]> = new Map();

  constructor(config: FirstOfficerConfig) {
    this.config = config;
  }

  /**
   * Validate task result quality
   */
  async validateTaskResult(
    task: TaskBreakdown,
    result: string,
    agentId: string
  ): Promise<QualityCheck> {
    console.log(`🔍 [QUALITY-VALIDATOR] Validating result for task: ${task.id}`);

    try {
      // Perform automated quality assessment
      const qualityCheck = await this.performQualityAssessment(task, result, agentId);
      
      // Store quality check in history
      const taskHistory = this.qualityHistory.get(task.id) || [];
      taskHistory.push(qualityCheck);
      this.qualityHistory.set(task.id, taskHistory);

      console.log(`✅ [QUALITY-VALIDATOR] Quality assessment completed:`, {
        taskId: task.id,
        score: qualityCheck.score,
        approved: qualityCheck.approved,
        issues: qualityCheck.issues.length
      });

      return qualityCheck;
    } catch (error) {
      console.error(`❌ [QUALITY-VALIDATOR] Quality validation failed:`, error);
      
      // Return default failing quality check
      return {
        taskId: task.id,
        result,
        score: 0,
        issues: [`Quality validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        suggestions: ['Manual review required'],
        approved: false,
        assessedBy: 'first-officer',
        assessedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Perform automated quality assessment using LLM
   */
  private async performQualityAssessment(
    task: TaskBreakdown,
    result: string,
    agentId: string
  ): Promise<QualityCheck> {
    const prompt = this.buildQualityAssessmentPrompt(task, result);
    
    try {
      const provider = await ProviderFactory.getProvider('first-officer-system');
      const response = await provider.complete(prompt);
      
      return this.parseQualityResponse(response.reply, task.id, result);
    } catch (error) {
      console.warn('LLM quality assessment failed, using rule-based assessment:', error);
      return this.performRuleBasedAssessment(task, result);
    }
  }

  /**
   * Build LLM prompt for quality assessment
   */
  private buildQualityAssessmentPrompt(task: TaskBreakdown, result: string) {
    const systemPrompt = `You are the First Officer's quality assessment system. Your role is to evaluate task results against requirements and provide detailed quality scores.

ASSESSMENT CRITERIA:
1. Completeness: Does the result fully address the task requirements?
2. Accuracy: Is the information correct and reliable?
3. Relevance: Does the result directly relate to the task objective?
4. Clarity: Is the result well-structured and easy to understand?
5. Deliverable Match: Does the result match the expected deliverable format?

SCORING SCALE: 0-100 (100 = perfect, 80+ = good, 60-79 = acceptable, <60 = needs improvement)

RESPONSE FORMAT:
Return a JSON object in this exact format:
{
  "overallScore": 85,
  "completeness": 90,
  "accuracy": 85,
  "relevance": 80,
  "clarity": 85,
  "issues": ["Minor formatting issues", "Could include more examples"],
  "suggestions": ["Add section headers", "Include specific examples"],
  "approved": true,
  "reasoning": "The result meets most requirements but has minor areas for improvement..."
}`;

    const userMessage = `
TASK TO ASSESS:
- Task ID: ${task.id}
- Description: ${task.description}
- Required Skills: ${task.requiredSkills.join(', ')}
- Expected Deliverable: ${task.deliverable}
- Estimated Effort: ${task.estimatedEffort || 'Unknown'} minutes

RESULT TO EVALUATE:
${result}

Please provide a comprehensive quality assessment with specific feedback.`;

    return buildPrompt(systemPrompt, [], userMessage);
  }

  /**
   * Parse LLM quality assessment response
   */
  private parseQualityResponse(response: string, taskId: string, result: string): QualityCheck {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON object found in response');
      }

      const assessment = JSON.parse(jsonMatch[0]);
      
      return {
        taskId,
        result,
        score: Math.max(0, Math.min(100, assessment.overallScore || 0)),
        issues: Array.isArray(assessment.issues) ? assessment.issues : [],
        suggestions: Array.isArray(assessment.suggestions) ? assessment.suggestions : [],
        approved: assessment.approved === true && (assessment.overallScore || 0) >= this.config.qualityThreshold,
        assessedBy: 'first-officer',
        assessedAt: new Date().toISOString()
      };
    } catch (error) {
      console.warn('Failed to parse quality assessment response:', error);
      throw new Error('Invalid quality assessment response format');
    }
  }

  /**
   * Rule-based quality assessment fallback
   */
  private performRuleBasedAssessment(task: TaskBreakdown, result: string): QualityCheck {
    const issues: string[] = [];
    const suggestions: string[] = [];
    let score = 100;

    // Check result length
    if (result.length < 50) {
      issues.push('Result appears too short for the task complexity');
      suggestions.push('Provide more detailed information');
      score -= 20;
    }

    // Check if result addresses the task description
    const taskKeywords = task.description.toLowerCase().split(/\s+/)
      .filter(word => word.length > 3);
    const resultLower = result.toLowerCase();
    const keywordMatches = taskKeywords.filter(keyword => 
      resultLower.includes(keyword)
    ).length;
    
    if (keywordMatches < taskKeywords.length * 0.3) {
      issues.push('Result may not fully address the task requirements');
      suggestions.push('Ensure all key aspects of the task are covered');
      score -= 15;
    }

    // Check for deliverable format
    if (task.deliverable.toLowerCase().includes('json') && !result.includes('{')) {
      issues.push('Expected JSON format not detected');
      suggestions.push('Format result as valid JSON');
      score -= 25;
    }

    if (task.deliverable.toLowerCase().includes('list') && !result.includes('-') && !result.includes('1.')) {
      issues.push('Expected list format not detected');
      suggestions.push('Format result as a clear list');
      score -= 15;
    }

    // Check for common quality indicators
    if (result.includes('TODO') || result.includes('FIXME')) {
      issues.push('Result contains incomplete sections');
      suggestions.push('Complete all TODO items before submission');
      score -= 30;
    }

    const finalScore = Math.max(0, score);
    
    return {
      taskId: task.id,
      result,
      score: finalScore,
      issues,
      suggestions,
      approved: finalScore >= this.config.qualityThreshold,
      assessedBy: 'first-officer',
      assessedAt: new Date().toISOString()
    };
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
   * Get quality statistics for completed tasks
   */
  getQualityStats(): {
    totalAssessments: number;
    averageScore: number;
    approvalRate: number;
    commonIssues: string[];
  } {
    const allChecks: QualityCheck[] = [];
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
  getTaskQualityHistory(taskId: string): QualityCheck[] {
    return this.qualityHistory.get(taskId) || [];
  }
}