'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ArrowLeft,
  Plus,
  Search,
  Filter,
  Rocket,
  Clock,
  Users,
  Target,
  TrendingUp,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Compass,
  Loader2,
  Activity,
  RotateCcw,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CreateExpeditionModal } from './CreateExpeditionModal'
import { ExpeditionCard } from './ExpeditionCard'
import { useExpeditionData } from '@/hooks/useExpeditionData'
// Socket import removed - using HTTP-only implementation
import { expeditionAPI } from '@/lib/expeditionApi'
import type { Expedition, ExpeditionStatus } from '@starships/protocol'

interface StarshipExpeditionsContentProps {
  slug: string
}

export function StarshipExpeditionsContent({ slug }: StarshipExpeditionsContentProps) {
  const router = useRouter()
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<ExpeditionStatus | 'all'>('all')

  // Get starship data (we'll need to fetch this)
  const [starshipId, setStarshipId] = useState<string>('')
  const [starship, setStarship] = useState<any>(null)
  const [starshipLoading, setStarshipLoading] = useState(true)

  // Use expedition data hook
  const { expeditions, expeditionsLoading, expeditionsError, stats, refreshExpeditions } =
    useExpeditionData({
      starshipId,
      autoRefresh: true,
      refreshInterval: 30000,
      enableWebSocket: true, // Enable WebSocket for real-time updates
    })

  // WebSocket integration enabled for real-time updates
  // Socket integration provides live expedition status updates
  // Manual refresh combined with automatic real-time updates via WebSocket

  // Fetch starship by slug to get the real ID
  useEffect(() => {
    const fetchStarshipBySlug = async () => {
      try {
        setStarshipLoading(true)
        // Import the starship API
        const { default: api } = await import('@/lib/api')

        // Fetch starship by slug (the endpoint supports both ID and slug)
        const response = await api.get(`/api/starships/${slug}`)
        const starshipData = response.data.starship

        if (starshipData?.id) {
          setStarshipId(starshipData.id)
          setStarship(starshipData)
        } else {
          console.warn(`[STARSHIP EXPEDITIONS] No starship found for slug: ${slug}`)
          // Set empty string to prevent API calls with invalid ID
          setStarshipId('')
          setStarship(null)
        }
      } catch (error: any) {
        console.error(`[STARSHIP EXPEDITIONS] Failed to fetch starship by slug: ${slug}`, error)
        // If starship not found, set empty string to prevent API calls
        setStarshipId('')
        setStarship(null)
      } finally {
        setStarshipLoading(false)
      }
    }

    if (slug) {
      fetchStarshipBySlug()
    }
  }, [slug])

  // Filter expeditions based on search and filters
  const filteredExpeditions = (expeditions || []).filter(expedition => {
    const matchesSearch =
      expedition.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      expedition.mission.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesStatus = statusFilter === 'all' || expedition.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const handleExpeditionClick = (expeditionId: string) => {
    router.push(`/ship/${slug}/expeditions/${expeditionId}`)
  }

  const handleCreateExpedition = () => {
    setShowCreateModal(true)
  }

  const handleExpeditionCreated = () => {
    setShowCreateModal(false)
    refreshExpeditions()
  }

  // Get status counts for badges
  const statusCounts: Record<string, number> = (expeditions || []).reduce(
    (acc, expedition) => {
      acc[expedition.status] = (acc[expedition.status] || 0) + 1
      return acc
    },
    {}
  )

  return (
    <div className="h-full flex flex-col">
      <div className="relative overflow-hidden">
        {/* Background gradient effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-primary/10" />
        
        <div className="relative flex items-center justify-between px-8 py-8 backdrop-blur-sm border-b border-border/40">
          <div className="flex items-center gap-6">
            <div>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-all"
                asChild
              >
                <Link href="/fleet">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Fleet
                </Link>
              </Button>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/5 blur-sm" />
                  <div className="relative bg-gradient-to-br from-primary/20 to-primary/10 p-3 rounded-xl shadow-sm border border-primary/20">
                    <Compass className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <div className="flex flex-col">
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                    Expeditions
                  </h1>
                  <p className="text-sm text-muted-foreground">Manage and track all missions</p>
                </div>
              </div>

              <div className="h-10 w-px bg-gradient-to-b from-transparent via-border/60 to-transparent" />

              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="absolute inset-0 bg-green-500/5" />
                  <div className="relative bg-gradient-to-br from-green-500/15 to-green-500/10 p-2 rounded-lg">
                    <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="text-base font-semibold text-foreground">
                    {starshipLoading ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Loading...
                      </span>
                    ) : (
                      starship?.name || 'Unknown Starship'
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Activity className="h-3 w-3" />
                    Active Starship
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-background/60 backdrop-blur-sm px-4 py-2 rounded-lg border border-border/40">
              <Rocket className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">
                {(expeditions || []).length}
              </span>
              <span className="text-sm text-muted-foreground">
                expedition{(expeditions || []).length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Enhanced Stats Overview with Animations */}
      {stats && (
        <div className="p-8 border-b bg-gradient-to-br from-background via-muted/5 to-primary/5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {/* Total Missions Card */}
            <div className="group transition-transform">
              <Card className="relative overflow-hidden border-primary/30 shadow-sm hover:shadow-lg transition-all duration-300 bg-gradient-to-br from-card via-card/95 to-primary/5">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent opacity-50" />
                <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-primary/5 rounded-full blur-sm group-hover:scale-110 transition-transform duration-500" />
                <div className="relative p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                        Total Missions
                      </p>
                      <p className="text-4xl font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent">
                        {stats.totalExpeditions}
                      </p>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-0 bg-primary/5 blur-sm" />
                      <div className="relative h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/30 flex items-center justify-center shadow-sm group-hover:shadow-md transition-all duration-300">
                        <Rocket className="h-7 w-7 text-primary" />
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Active Now Card */}
            <div className="group transition-transform">
              <Card className="relative overflow-hidden border-blue-500/30 shadow-sm hover:shadow-lg transition-all duration-300 bg-gradient-to-br from-card via-card/95 to-blue-500/5">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent opacity-50" />
                <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-blue-500/5 rounded-full blur-sm group-hover:scale-110 transition-transform duration-500" />
                <div className="relative p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                        Active Now
                      </p>
                      <p className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-blue-500 bg-clip-text text-transparent">
                        {stats.activeExpeditions}
                      </p>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-0 bg-blue-500/5 blur-sm" />
                      <div className="relative h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-500/30 flex items-center justify-center shadow-sm group-hover:shadow-md transition-all duration-300">
                        <Clock className="h-7 w-7 text-blue-500" />
                      </div>
                    </div>
                  </div>
                  {stats.activeExpeditions > 0 && (
                    <div className="mt-3 flex items-center gap-2">
                      <div className="h-2 w-2 bg-blue-500 rounded-full animate-pulse" />
                      <span className="text-xs text-blue-600 dark:text-blue-400">In Progress</span>
                    </div>
                  )}
                </div>
              </Card>
            </div>

            {/* Completed Card */}
            <div className="group transition-transform">
              <Card className="relative overflow-hidden border-green-500/30 shadow-sm hover:shadow-lg transition-all duration-300 bg-gradient-to-br from-card via-card/95 to-green-500/5">
                <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 via-green-500/5 to-transparent opacity-50" />
                <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-green-500/5 rounded-full blur-sm group-hover:scale-110 transition-transform duration-500" />
                <div className="relative p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                        Completed
                      </p>
                      <p className="text-4xl font-bold bg-gradient-to-r from-green-600 to-green-500 bg-clip-text text-transparent">
                        {stats.completedExpeditions}
                      </p>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-0 bg-green-500/5 blur-sm" />
                      <div className="relative h-14 w-14 rounded-2xl bg-gradient-to-br from-green-500/20 to-green-500/30 flex items-center justify-center shadow-sm group-hover:shadow-md transition-all duration-300">
                        <CheckCircle2 className="h-7 w-7 text-green-500" />
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* Success Rate Card */}
            <div className="group transition-transform">
              <Card className="relative overflow-hidden border-purple-500/30 shadow-sm hover:shadow-lg transition-all duration-300 bg-gradient-to-br from-card via-card/95 to-purple-500/5">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-transparent opacity-50" />
                <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-purple-500/5 rounded-full blur-sm group-hover:scale-110 transition-transform duration-500" />
                <div className="relative p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                        Success Rate
                      </p>
                      <div className="flex items-baseline gap-1">
                        <p className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-purple-500 bg-clip-text text-transparent">
                          {Math.round(stats.successRate)}
                        </p>
                        <span className="text-xl text-purple-600 dark:text-purple-400 font-bold">%</span>
                      </div>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-0 bg-purple-500/5 blur-sm" />
                      <div className="relative h-14 w-14 rounded-2xl bg-gradient-to-br from-purple-500/20 to-purple-500/30 flex items-center justify-center shadow-sm group-hover:shadow-md transition-all duration-300">
                        <TrendingUp className="h-7 w-7 text-purple-500" />
                      </div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="w-full bg-purple-500/10 rounded-full h-1.5">
                      <div 
                        className="bg-gradient-to-r from-purple-500 to-purple-600 h-1.5 rounded-full transition-all duration-1000"
                        style={{ width: `${stats.successRate}%` }}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Filters and Search Section */}
      <div className="px-8 py-6 border-b bg-card/50">
        <div className="flex flex-col gap-4">
          {/* Search and Filter Row */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Search expeditions..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-11 pr-11 h-10 bg-background border-input hover:border-muted-foreground/50 focus:border-primary transition-colors text-sm"
              />
              {searchQuery && (
                <button
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted"
                  onClick={() => setSearchQuery('')}
                >
                  <XCircle className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            
            <Select
              value={statusFilter}
              onValueChange={value => setStatusFilter(value as ExpeditionStatus | 'all')}
            >
              <SelectTrigger className="w-full md:w-48 h-10 bg-background border-input hover:border-muted-foreground/50 focus:border-primary transition-colors">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                  <SelectItem value="all">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-muted-foreground" />
                      <span>All Status</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="draft">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-slate-500" />
                      <span>Draft</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="planning">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-blue-500" />
                      <span>Planning</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="in-progress">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-amber-500" />
                      <span>In Progress</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="review">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-purple-500" />
                      <span>Review</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="completed">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-emerald-500" />
                      <span>Completed</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="failed">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-red-500" />
                      <span>Failed</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="cancelled">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-gray-500" />
                      <span>Cancelled</span>
                    </div>
                  </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Status Badges */}
          {Object.keys(statusCounts).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(statusCounts).map(([status, count]) => {
                const statusConfig = {
                  draft: {
                    className: 'bg-slate-50 text-slate-700 dark:bg-slate-900/50 dark:text-slate-300 border-slate-200 dark:border-slate-700',
                    dotColor: 'bg-slate-500',
                  },
                  planning: {
                    className: 'bg-blue-50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 border-blue-200 dark:border-blue-700',
                    dotColor: 'bg-blue-500',
                  },
                  'in-progress': {
                    className: 'bg-amber-50 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300 border-amber-200 dark:border-amber-700',
                    dotColor: 'bg-amber-500',
                  },
                  review: {
                    className: 'bg-purple-50 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 border-purple-200 dark:border-purple-700',
                    dotColor: 'bg-purple-500',
                  },
                  completed: {
                    className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700',
                    dotColor: 'bg-emerald-500',
                  },
                  failed: {
                    className: 'bg-red-50 text-red-700 dark:bg-red-900/50 dark:text-red-300 border-red-200 dark:border-red-700',
                    dotColor: 'bg-red-500',
                  },
                  cancelled: {
                    className: 'bg-gray-50 text-gray-700 dark:bg-gray-900/50 dark:text-gray-300 border-gray-200 dark:border-gray-700',
                    dotColor: 'bg-gray-500',
                  },
                }[status] || {
                  className: 'bg-gray-50 text-gray-700 dark:bg-gray-900/50 dark:text-gray-300 border-gray-200 dark:border-gray-700',
                  dotColor: 'bg-gray-500',
                }

                return (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(status as ExpeditionStatus)}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium ${statusConfig.className} border hover:opacity-80 transition-opacity`}
                  >
                    <div className={`h-1.5 w-1.5 rounded-full ${statusConfig.dotColor}`} />
                    <span>{status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ')}</span>
                    <span className="font-semibold">
                      {count as number}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Expeditions List with Enhanced States */}
      <div className="flex-1 p-8 overflow-auto bg-background">
        {expeditionsLoading || !starshipId ? (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {[...Array(6)].map((_, index) => (
              <div key={index}>
                <Card className="relative overflow-hidden bg-gradient-to-br from-card/50 to-card/30 backdrop-blur-sm border-border/30">
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
                  <CardHeader className="pb-3 relative">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0 space-y-3">
                        <Skeleton className="h-6 w-3/4 bg-primary/10" />
                        <div className="space-y-2">
                          <Skeleton className="h-4 w-full bg-muted/20" />
                          <Skeleton className="h-4 w-5/6 bg-muted/20" />
                        </div>
                      </div>
                      <div className="flex flex-col items-end space-y-2">
                        <Skeleton className="h-6 w-20 bg-primary/10 rounded-lg" />
                        <Skeleton className="h-6 w-16 bg-muted/20 rounded-lg" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 relative">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Skeleton className="h-4 w-16 bg-muted/20" />
                        <Skeleton className="h-4 w-10 bg-muted/20" />
                      </div>
                      <Skeleton className="h-2 w-full bg-primary/10 rounded-full" />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex -space-x-2">
                        {[...Array(3)].map((_, i) => (
                          <Skeleton key={i} className="h-8 w-8 rounded-full bg-muted/20 border-2 border-background" />
                        ))}
                      </div>
                      <Skeleton className="h-4 w-20 bg-muted/20" />
                    </div>
                    <Skeleton className="h-9 w-full rounded-lg bg-primary/10" />
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        ) : expeditionsError ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <Card className="p-8 text-center max-w-md bg-gradient-to-br from-red-500/5 to-red-500/10 border-red-200 dark:border-red-800 shadow-lg">
              <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="h-8 w-8 text-red-500" />
              </div>
              <h3 className="text-lg font-semibold mb-2 text-red-900 dark:text-red-100">Failed to Load Expeditions</h3>
              <p className="text-sm text-red-800 dark:text-red-200 mb-6">
                {expeditionsError?.message || 'An unexpected error occurred while loading expeditions.'}
              </p>
              <Button 
                onClick={refreshExpeditions} 
                variant="outline" 
                className="border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Try Again
              </Button>
            </Card>
          </div>
        ) : filteredExpeditions.length === 0 ? (
          <div className="flex items-center justify-center min-h-[400px]">
            <Card className="p-10 text-center max-w-lg bg-gradient-to-br from-card via-card/95 to-primary/5 border-primary/20 shadow-lg">
              <div className="mb-6">
                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
                  <Rocket className="h-10 w-10 text-primary" />
                </div>
              </div>
              
              <h3 className="text-2xl font-bold mb-3 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                {(expeditions || []).length === 0 ? 'Launch Your First Expedition' : 'No Matching Expeditions'}
              </h3>
              
              <p className="text-muted-foreground mb-6 text-base leading-relaxed">
                {(expeditions || []).length === 0
                  ? 'Begin your journey by creating an expedition. Set missions, assign agents, and explore new frontiers.'
                  : searchQuery || statusFilter !== 'all'
                  ? 'Try adjusting your search criteria or filters to find expeditions.'
                  : 'No expeditions match your current filters.'}
              </p>
              
              {(expeditions || []).length === 0 ? (
                <div>
                  <Button 
                    onClick={handleCreateExpedition}
                    size="lg"
                    className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-sm hover:shadow-md transition-all duration-300"
                  >
                    <Plus className="h-5 w-5 mr-2" />
                    Create Your First Expedition
                  </Button>
                </div>
              ) : (
                <div className="flex gap-3 justify-center">
                  {searchQuery && (
                    <Button 
                      onClick={() => setSearchQuery('')}
                      variant="outline"
                      className="hover:bg-primary/10"
                    >
                      Clear Search
                    </Button>
                  )}
                  {statusFilter !== 'all' && (
                    <Button 
                      onClick={() => setStatusFilter('all')}
                      variant="outline"
                      className="hover:bg-primary/10"
                    >
                      Clear Filter
                    </Button>
                  )}
                </div>
              )}
            </Card>
          </div>
        ) : (
          <div className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            <AnimatePresence mode="popLayout">
              {filteredExpeditions.map((expedition, index) => (
              <motion.div
                key={expedition.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: index * 0.05 }}
              >
                <ExpeditionCard
                  expedition={expedition}
                  onClick={() => handleExpeditionClick(expedition.id)}
                  showActions={true}
                  enableRealTimeUpdates={false}
                  enableContextMenu={true}
                  showAgentAvatars={true}
                  showQualityScore={true}
                  showTaskProgress={true}
                  onStart={async expeditionId => {
                    try {
                      await expeditionAPI.startExpedition(starshipId, expeditionId)
                      refreshExpeditions()
                      return true
                    } catch (error) {
                      console.error('Failed to start expedition:', error)
                      return false
                    }
                  }}
                  onPause={async expeditionId => {
                    try {
                      await expeditionAPI.pauseExpedition(starshipId, expeditionId)
                      refreshExpeditions()
                      return true
                    } catch (error) {
                      console.error('Failed to pause expedition:', error)
                      return false
                    }
                  }}
                  onResume={async expeditionId => {
                    try {
                      await expeditionAPI.resumeExpedition(starshipId, expeditionId)
                      refreshExpeditions()
                      return true
                    } catch (error) {
                      console.error('Failed to resume expedition:', error)
                      return false
                    }
                  }}
                  onCancel={async expeditionId => {
                    try {
                      await expeditionAPI.cancelExpedition(starshipId, expeditionId)
                      refreshExpeditions()
                      return true
                    } catch (error) {
                      console.error('Failed to cancel expedition:', error)
                      return false
                    }
                  }}
                  onViewChat={expeditionId => {
                    router.push(`/ship/${slug}/expeditions/${expeditionId}?tab=chat`)
                  }}
                  onDelete={async expeditionId => {
                    if (
                      confirm(
                        'Are you sure you want to delete this expedition? This action cannot be undone.'
                      )
                    ) {
                      try {
                        await expeditionAPI.deleteExpedition(starshipId, expeditionId)
                        refreshExpeditions()
                      } catch (error: any) {
                        console.error('Failed to delete expedition:', error)
                        // Show a user-friendly error message
                        const errorMessage =
                          error?.response?.data?.message ||
                          error?.message ||
                          'Failed to delete expedition'
                        alert(`Error: ${errorMessage}`)
                      }
                    }
                  }}
                />
              </motion.div>
            ))}
            </AnimatePresence>
          </div>
        )}
      </div>


      {/* Create Expedition Modal */}
      <CreateExpeditionModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onExpeditionCreated={handleExpeditionCreated}
        starshipId={starshipId}
        starshipSlug={slug}
        starshipName={starship?.name}
      />
    </div>
  )
}
