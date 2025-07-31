'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  Star,
  TrendingUp,
  TrendingDown,
  Target,
  Award,
  AlertCircle,
  CheckCircle,
  XCircle,
  BarChart3,
  Sparkles
} from 'lucide-react';
import { QualityCheck } from '@starships/protocol';

interface QualityScoreDisplayProps {
  qualityChecks: QualityCheck[];
  threshold?: number;
  showBreakdown?: boolean;
  showTrends?: boolean;
}

export function QualityScoreDisplay({ 
  qualityChecks, 
  threshold = 70,
  showBreakdown = true,
  showTrends = true
}: QualityScoreDisplayProps) {
  
  // Calculate overall statistics
  const calculateStats = () => {
    if (qualityChecks.length === 0) {
      return {
        average: 0,
        min: 0,
        max: 0,
        passRate: 0,
        totalChecks: 0,
        passedChecks: 0,
        failedChecks: 0
      };
    }

    const scores = qualityChecks.map(check => check.score);
    const passedChecks = qualityChecks.filter(check => check.approved).length;
    
    return {
      average: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      min: Math.min(...scores),
      max: Math.max(...scores),
      passRate: Math.round((passedChecks / qualityChecks.length) * 100),
      totalChecks: qualityChecks.length,
      passedChecks,
      failedChecks: qualityChecks.length - passedChecks
    };
  };

  const stats = calculateStats();

  // Get score color based on value
  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    if (score >= 50) return 'text-orange-600';
    return 'text-red-600';
  };

  // Get score background based on value
  const getScoreBg = (score: number) => {
    if (score >= 90) return 'bg-green-100';
    if (score >= 70) return 'bg-yellow-100';
    if (score >= 50) return 'bg-orange-100';
    return 'bg-red-100';
  };

  // Get trend direction
  const getTrend = () => {
    if (qualityChecks.length < 2) return 'stable';
    
    const recentScores = qualityChecks.slice(-5).map(check => check.score);
    const olderScores = qualityChecks.slice(-10, -5).map(check => check.score);
    
    if (olderScores.length === 0) return 'stable';
    
    const recentAvg = recentScores.reduce((a, b) => a + b, 0) / recentScores.length;
    const olderAvg = olderScores.reduce((a, b) => a + b, 0) / olderScores.length;
    
    if (recentAvg > olderAvg + 5) return 'improving';
    if (recentAvg < olderAvg - 5) return 'declining';
    return 'stable';
  };

  const trend = getTrend();

  // Group issues by frequency
  const getTopIssues = () => {
    const issueCount = new Map<string, number>();
    
    qualityChecks.forEach(check => {
      check.issues.forEach(issue => {
        issueCount.set(issue, (issueCount.get(issue) || 0) + 1);
      });
    });
    
    return Array.from(issueCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  };

  const topIssues = getTopIssues();

  if (qualityChecks.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <div className="text-center text-muted-foreground">
            <Sparkles className="h-8 w-8 mx-auto mb-2" />
            <p>No quality checks performed yet</p>
            <p className="text-sm">Quality scores will appear here after task completion</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Overall Quality Score */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Overall Quality Score</span>
            {trend === 'improving' && (
              <div className="flex items-center text-green-600">
                <TrendingUp className="h-4 w-4 mr-1" />
                <span className="text-sm">Improving</span>
              </div>
            )}
            {trend === 'declining' && (
              <div className="flex items-center text-red-600">
                <TrendingDown className="h-4 w-4 mr-1" />
                <span className="text-sm">Declining</span>
              </div>
            )}
          </CardTitle>
          <CardDescription>
            Aggregate quality metrics across all completed tasks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {/* Main Score Display */}
            <div className="text-center">
              <div className={`text-6xl font-bold ${getScoreColor(stats.average)}`}>
                {stats.average}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Average Quality Score
              </p>
            </div>

            {/* Score Progress Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Quality Threshold: {threshold}%</span>
                <span className={stats.average >= threshold ? 'text-green-600' : 'text-red-600'}>
                  {stats.average >= threshold ? 'PASSING' : 'FAILING'}
                </span>
              </div>
              <Progress 
                value={stats.average} 
                className="h-3"
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>0</span>
                <span>50</span>
                <span>100</span>
              </div>
            </div>

            {/* Key Metrics */}
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 rounded-lg bg-accent/50">
                <BarChart3 className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-2xl font-semibold">{stats.passRate}%</p>
                <p className="text-xs text-muted-foreground">Pass Rate</p>
              </div>
              
              <div className="text-center p-3 rounded-lg bg-accent/50">
                <CheckCircle className="h-5 w-5 mx-auto mb-1 text-green-600" />
                <p className="text-2xl font-semibold">{stats.passedChecks}</p>
                <p className="text-xs text-muted-foreground">Passed</p>
              </div>
              
              <div className="text-center p-3 rounded-lg bg-accent/50">
                <XCircle className="h-5 w-5 mx-auto mb-1 text-red-600" />
                <p className="text-2xl font-semibold">{stats.failedChecks}</p>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quality Breakdown */}
      {showBreakdown && (
        <Card>
          <CardHeader>
            <CardTitle>Quality Breakdown</CardTitle>
            <CardDescription>
              Individual quality check results
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {qualityChecks.slice(-10).reverse().map((check, index) => (
                <div key={`${check.taskId}-${index}`} className="flex items-center justify-between p-3 rounded-lg border">
                  <div className="flex items-center space-x-3">
                    {check.approved ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : (
                      <XCircle className="h-5 w-5 text-red-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium">Task #{check.taskId.slice(-6)}</p>
                      <p className="text-xs text-muted-foreground">
                        Assessed by {check.assessedBy}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-3">
                    <div className="text-right">
                      <div className={`text-lg font-semibold ${getScoreColor(check.score)}`}>
                        {check.score}%
                      </div>
                      {check.issues.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {check.issues.length} issue{check.issues.length !== 1 ? 's' : ''}
                        </p>
                      )}
                    </div>
                    <Badge 
                      variant="outline" 
                      className={`${getScoreColor(check.score)} ${getScoreBg(check.score)}`}
                    >
                      {check.approved ? 'Pass' : 'Fail'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Common Issues */}
      {topIssues.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <AlertCircle className="h-5 w-5" />
              <span>Common Quality Issues</span>
            </CardTitle>
            <CardDescription>
              Most frequently occurring issues across all tasks
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topIssues.map(([issue, count]) => (
                <div key={issue} className="flex items-center justify-between p-2 rounded-lg bg-accent/50">
                  <p className="text-sm">{issue}</p>
                  <Badge variant="outline">
                    {count} occurrence{count !== 1 ? 's' : ''}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quality Achievements */}
      {stats.average >= 90 && (
        <Card className="border-green-200 bg-green-50/50">
          <CardContent className="flex items-center space-x-3 p-6">
            <Award className="h-8 w-8 text-green-600" />
            <div>
              <p className="font-semibold text-green-900">Excellent Quality!</p>
              <p className="text-sm text-green-700">
                Your expedition is maintaining exceptional quality standards
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}