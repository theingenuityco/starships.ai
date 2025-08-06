'use client';

import { motion } from 'motion/react';
import { TrendingUp, TrendingDown, Minus, Target, Lightbulb, Zap, Eye } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import type { VisionMetrics } from '@starships/protocol';

interface VisionMetricsDisplayProps {
  metrics?: VisionMetrics;
  previousMetrics?: VisionMetrics;
  isAnalyzing?: boolean;
  className?: string;
}

interface MetricCardProps {
  label: string;
  value: number;
  previousValue?: number;
  icon: React.ReactNode;
  description: string;
  color: string;
  isAnalyzing?: boolean;
}

function MetricCard({ 
  label, 
  value, 
  previousValue, 
  icon, 
  description, 
  color, 
  isAnalyzing = false 
}: MetricCardProps) {
  const trend = previousValue !== undefined ? value - previousValue : 0;
  const trendIcon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 dark:text-green-400';
    if (score >= 60) return 'text-blue-600 dark:text-blue-400';
    if (score >= 40) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return 'bg-green-500/10 border-green-500/20';
    if (score >= 60) return 'bg-blue-500/10 border-blue-500/20';
    if (score >= 40) return 'bg-yellow-500/10 border-yellow-500/20';
    return 'bg-red-500/10 border-red-500/20';
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="cursor-help"
          >
            <Card className={`${getScoreBg(value)} transition-all hover:scale-105 hover:shadow-md`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-2 rounded-lg ${color}/10`}>
                    {isAnalyzing ? (
                      <div className={`animate-spin ${color}`}>
                        {icon}
                      </div>
                    ) : (
                      <div className={color}>
                        {icon}
                      </div>
                    )}
                  </div>
                  {trend !== 0 && !isAnalyzing && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className={`flex items-center gap-1 ${
                        trend > 0 
                          ? 'text-green-600 dark:text-green-400' 
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      <trendIcon className="w-3 h-3" />
                      <span className="text-xs font-mono">
                        {trend > 0 ? '+' : ''}{trend}
                      </span>
                    </motion.div>
                  )}
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-muted-foreground font-medium">
                      {label}
                    </span>
                    {isAnalyzing ? (
                      <div className="flex items-center gap-1">
                        <div className="w-2 h-2 bg-purple-500 rounded-full animate-pulse" />
                        <span className="text-xs text-purple-600 dark:text-purple-400">
                          Analyzing
                        </span>
                      </div>
                    ) : (
                      <span className={`text-lg font-bold font-mono ${getScoreColor(value)}`}>
                        {value}
                      </span>
                    )}
                  </div>
                  
                  {!isAnalyzing && (
                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${value}%` }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className={`h-full rounded-full ${
                          value >= 80 ? 'bg-green-500' :
                          value >= 60 ? 'bg-blue-500' :
                          value >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                      />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p className="text-sm">{description}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function VisionMetricsDisplay({ 
  metrics, 
  previousMetrics, 
  isAnalyzing = false,
  className = "" 
}: VisionMetricsDisplayProps) {
  if (!metrics && !isAnalyzing) {
    return null;
  }

  const metricsToDisplay = metrics || {
    clarityScore: 0,
    specificityScore: 0,
    actionabilityScore: 0,
    inspirationalScore: 0,
    hasObjectives: false,
    hasTimeframe: false,
    hasMeasurables: false,
    overallQuality: 0,
    confidence: 0,
    refinementCount: 0
  };

  const overallScore = isAnalyzing ? 0 : metricsToDisplay.overallQuality;
  const previousOverall = previousMetrics?.overallQuality;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header with Overall Score */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute inset-0 bg-purple-500/10 blur-sm" />
            <div className="relative bg-gradient-to-br from-purple-500/15 to-purple-500/10 p-2 rounded-xl">
              <Eye className="w-5 h-5 text-purple-500" />
            </div>
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Vision Metrics</h3>
            <p className="text-sm text-muted-foreground">Real-time vision quality assessment</p>
          </div>
        </div>
        
        {!isAnalyzing && (
          <div className="text-right">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Overall Score</span>
              {previousOverall !== undefined && overallScore !== previousOverall && (
                <div className={`flex items-center gap-1 ${
                  overallScore > previousOverall 
                    ? 'text-green-600 dark:text-green-400' 
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {overallScore > previousOverall ? 
                    <TrendingUp className="w-3 h-3" /> : 
                    <TrendingDown className="w-3 h-3" />
                  }
                  <span className="text-xs font-mono">
                    {overallScore > previousOverall ? '+' : ''}{overallScore - previousOverall}
                  </span>
                </div>
              )}
            </div>
            <div className={`text-2xl font-bold font-mono ${
              overallScore >= 80 ? 'text-green-600 dark:text-green-400' :
              overallScore >= 60 ? 'text-blue-600 dark:text-blue-400' :
              overallScore >= 40 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {overallScore}
            </div>
          </div>
        )}
      </motion.div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Clarity"
          value={metricsToDisplay.clarityScore}
          previousValue={previousMetrics?.clarityScore}
          icon={<Eye className="w-4 h-4" />}
          description="How clear and understandable the vision statement is. A clear vision uses simple language and avoids ambiguity."
          color="text-blue-500"
          isAnalyzing={isAnalyzing}
        />
        
        <MetricCard
          label="Specificity"
          value={metricsToDisplay.specificityScore}
          previousValue={previousMetrics?.specificityScore}
          icon={<Target className="w-4 h-4" />}
          description="How specific and concrete the vision is. Specific visions include measurable goals and defined outcomes."
          color="text-green-500"
          isAnalyzing={isAnalyzing}
        />
        
        <MetricCard
          label="Actionability"
          value={metricsToDisplay.actionabilityScore}
          previousValue={previousMetrics?.actionabilityScore}
          icon={<Zap className="w-4 h-4" />}
          description="How actionable and achievable the vision is. Actionable visions provide clear direction for next steps."
          color="text-yellow-500"
          isAnalyzing={isAnalyzing}
        />
        
        <MetricCard
          label="Inspiration"
          value={metricsToDisplay.inspirationalScore}
          previousValue={previousMetrics?.inspirationalScore}
          icon={<Lightbulb className="w-4 h-4" />}
          description="How inspiring and motivating the vision is. Inspirational visions energize and align team members."
          color="text-purple-500"
          isAnalyzing={isAnalyzing}
        />
      </div>

      {/* Completeness Indicators */}
      {!isAnalyzing && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-3"
        >
          <div className={`flex items-center gap-2 p-3 rounded-lg border ${
            metricsToDisplay.hasObjectives 
              ? 'bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-300'
              : 'bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-300'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              metricsToDisplay.hasObjectives ? 'bg-green-500' : 'bg-red-500'
            }`} />
            <span className="text-sm font-medium">
              {metricsToDisplay.hasObjectives ? 'Has Objectives' : 'Missing Objectives'}
            </span>
          </div>
          
          <div className={`flex items-center gap-2 p-3 rounded-lg border ${
            metricsToDisplay.hasTimeframe 
              ? 'bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-300'
              : 'bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-300'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              metricsToDisplay.hasTimeframe ? 'bg-green-500' : 'bg-red-500'
            }`} />
            <span className="text-sm font-medium">
              {metricsToDisplay.hasTimeframe ? 'Has Timeframe' : 'Missing Timeframe'}
            </span>
          </div>
          
          <div className={`flex items-center gap-2 p-3 rounded-lg border ${
            metricsToDisplay.hasMeasurables 
              ? 'bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-300'
              : 'bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-300'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              metricsToDisplay.hasMeasurables ? 'bg-green-500' : 'bg-red-500'
            }`} />
            <span className="text-sm font-medium">
              {metricsToDisplay.hasMeasurables ? 'Has Measurables' : 'Missing Measurables'}
            </span>
          </div>
        </motion.div>
      )}

      {/* Refinement Count */}
      {!isAnalyzing && metricsToDisplay.refinementCount > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center p-2 bg-muted/30 rounded-lg"
        >
          <span className="text-xs text-muted-foreground">
            Vision refined {metricsToDisplay.refinementCount} time{metricsToDisplay.refinementCount > 1 ? 's' : ''}
          </span>
        </motion.div>
      )}
    </div>
  );
}