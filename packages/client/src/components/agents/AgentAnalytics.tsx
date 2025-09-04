'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/hooks/useToast'
import { BarChart3, TrendingUp, Star, Activity, Calendar, Eye, MessageSquare } from 'lucide-react'

interface AgentAnalytics {
  usageCount: number
  rating: number
  createdAt: string
  updatedAt: string
  category: string
  isPublic: boolean
}

interface AgentAnalyticsProps {
  agentId: string
  agentName: string
  onClose?: () => void
}

export function AgentAnalytics({ agentId, agentName, onClose }: AgentAnalyticsProps) {
  const [analytics, setAnalytics] = useState<AgentAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [submittingRating, setSubmittingRating] = useState(false)
  const { toast } = useToast()

  useEffect(() => {
    fetchAnalytics()
  }, [agentId])

  const fetchAnalytics = async () => {
    try {
      setLoading(true)
      const response = await fetch(`/api/agents/${agentId}/analytics`, {
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to fetch analytics')
      }

      const data = await response.json()
      setAnalytics(data)
    } catch (error) {
      console.error('Error fetching analytics:', error)
      toast({
        title: 'Error',
        description: 'Failed to load analytics data',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const submitRating = async (newRating: number) => {
    try {
      setSubmittingRating(true)
      const response = await fetch(`/api/agents/${agentId}/rate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ rating: newRating }),
      })

      if (!response.ok) {
        throw new Error('Failed to submit rating')
      }

      const result = await response.json()

      // Update local analytics with new rating
      if (analytics) {
        setAnalytics({
          ...analytics,
          rating: result.newRating,
        })
      }

      toast({
        title: 'Rating Submitted',
        description: `You rated ${agentName} ${newRating} star${newRating !== 1 ? 's' : ''}`,
      })
    } catch (error) {
      console.error('Error submitting rating:', error)
      toast({
        title: 'Error',
        description: 'Failed to submit rating',
        variant: 'destructive',
      })
    } finally {
      setSubmittingRating(false)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const getRatingColor = (rating: number) => {
    if (rating >= 4) return 'text-green-600'
    if (rating >= 3) return 'text-yellow-600'
    if (rating >= 2) return 'text-orange-600'
    return 'text-red-600'
  }

  const getUsageLevel = (count: number) => {
    if (count >= 100) return { level: 'High', color: 'bg-green-500', percentage: 100 }
    if (count >= 50) return { level: 'Medium', color: 'bg-yellow-500', percentage: 75 }
    if (count >= 10) return { level: 'Low', color: 'bg-orange-500', percentage: 50 }
    return { level: 'New', color: 'bg-blue-500', percentage: 25 }
  }

  if (loading) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Analytics for {agentName}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!analytics) {
    return (
      <Card className="w-full max-w-2xl mx-auto">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Analytics for {agentName}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground py-8">No analytics data available</p>
        </CardContent>
      </Card>
    )
  }

  const usageLevel = getUsageLevel(analytics.usageCount)

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Analytics for {agentName}
            </CardTitle>
            <CardDescription>Performance metrics and usage statistics</CardDescription>
          </div>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              ×
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Key Metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <MessageSquare className="h-8 w-8 text-blue-500" />
            </div>
            <div className="text-2xl font-bold">{analytics.usageCount}</div>
            <div className="text-sm text-muted-foreground">Total Uses</div>
          </div>

          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <Star className={`h-8 w-8 ${getRatingColor(analytics.rating)}`} />
            </div>
            <div className="text-2xl font-bold">{analytics.rating.toFixed(1)}</div>
            <div className="text-sm text-muted-foreground">Rating</div>
          </div>

          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <Eye className="h-8 w-8 text-purple-500" />
            </div>
            <Badge variant={analytics.isPublic ? 'default' : 'secondary'}>
              {analytics.isPublic ? 'Public' : 'Private'}
            </Badge>
            <div className="text-sm text-muted-foreground mt-1">Visibility</div>
          </div>

          <div className="text-center">
            <div className="flex items-center justify-center mb-2">
              <Activity className="h-8 w-8 text-green-500" />
            </div>
            <Badge variant="outline">{analytics.category}</Badge>
            <div className="text-sm text-muted-foreground mt-1">Category</div>
          </div>
        </div>

        {/* Usage Level */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Usage Level</span>
            <Badge variant="outline">{usageLevel.level}</Badge>
          </div>
          <Progress value={usageLevel.percentage} className="h-2" />
          <p className="text-xs text-muted-foreground">
            Based on {analytics.usageCount} total interactions
          </p>
        </div>

        {/* Rating Section */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Rate this Agent</h3>
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4, 5].map(star => (
              <button
                key={star}
                onClick={() => submitRating(star)}
                disabled={submittingRating}
                className="p-1 rounded transition-colors text-gray-300 hover:text-yellow-400 disabled:opacity-50"
              >
                <Star className="h-6 w-6 fill-current" />
              </button>
            ))}
            {submittingRating && (
              <div className="ml-2 animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Current rating: {analytics.rating.toFixed(1)}/5.0
          </p>
        </div>

        {/* Timeline */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Timeline</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Created:</span>
              <span>{formatDate(analytics.createdAt)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Last Updated:</span>
              <span>{formatDate(analytics.updatedAt)}</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
