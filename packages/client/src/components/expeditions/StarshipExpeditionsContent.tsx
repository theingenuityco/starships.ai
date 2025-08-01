'use client'

import { useState, useEffect } from 'react'
import { motion } from 'motion/react'
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
  const statusCounts = (expeditions || []).reduce(
    (acc, expedition) => {
      acc[expedition.status] = (acc[expedition.status] || 0) + 1
      return acc
    },
    {} as Record<string, number>
  )

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="h-full flex flex-col"
    >
      {/* Professional Header with Enhanced Design */}
      <div className="relative overflow-hidden">
        {/* Background gradient effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-primary/10" />
        
        <div className="relative flex items-center justify-between px-8 py-8 backdrop-blur-sm border-b border-border/40">
          <div className="flex items-center gap-6">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
            >
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
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="flex items-center gap-4"
            >
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-primary/20 blur-xl" />
                  <div className="relative bg-gradient-to-br from-primary/30 to-primary/20 p-3 rounded-xl shadow-lg border border-primary/30">
                    <Compass className="h-6 w-6 text-primary" />
                  </div>
                </div>
                <div className="flex flex-col">
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                    Expeditions Hub
                  </h1>
                  <p className="text-sm text-muted-foreground">Manage and track all missions</p>
                </div>
              </div>

              <div className="h-10 w-px bg-gradient-to-b from-transparent via-border/60 to-transparent" />

              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="absolute inset-0 bg-green-500/20 blur-lg" />
                  <div className="relative bg-gradient-to-br from-green-500/20 to-green-500/10 p-2 rounded-lg">
                    <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse shadow-lg shadow-green-500/50" />
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
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="flex items-center gap-4"
          >
            <div className="flex items-center gap-2 bg-background/60 backdrop-blur-sm px-4 py-2 rounded-lg border border-border/40">
              <Rocket className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-foreground">
                {(expeditions || []).length}
              </span>
              <span className="text-sm text-muted-foreground">
                expedition{(expeditions || []).length !== 1 ? 's' : ''}
              </span>
            </div>
            
            <Button
              onClick={handleCreateExpedition}
              className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25 transition-all duration-300 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Expedition
            </Button>
          </motion.div>
        </div>
      </div>

      {/* Enhanced Stats Overview with Animations */}
      {stats && (
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="p-8 border-b bg-gradient-to-br from-background via-muted/5 to-primary/5"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {/* Total Missions Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              whileHover={{ scale: 1.05, y: -5 }}
              className="group"
            >
              <Card className="relative overflow-hidden border-primary/30 shadow-lg hover:shadow-2xl transition-all duration-300 bg-gradient-to-br from-card via-card/95 to-primary/5">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent opacity-50" />
                <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-primary/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
                <div className="relative p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                        Total Missions
                      </p>
                      <motion.p 
                        className="text-4xl font-bold bg-gradient-to-r from-foreground to-foreground/80 bg-clip-text text-transparent"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.3 }}
                      >
                        {stats.totalExpeditions}
                      </motion.p>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-0 bg-primary/20 blur-xl scale-150" />
                      <div className="relative h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/30 flex items-center justify-center shadow-lg group-hover:shadow-primary/30 transition-all duration-300">
                        <Rocket className="h-7 w-7 text-primary" />
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>

            {/* Active Now Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              whileHover={{ scale: 1.05, y: -5 }}
              className="group"
            >
              <Card className="relative overflow-hidden border-blue-500/30 shadow-lg hover:shadow-2xl transition-all duration-300 bg-gradient-to-br from-card via-card/95 to-blue-500/5">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-blue-500/5 to-transparent opacity-50" />
                <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
                <div className="relative p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                        Active Now
                      </p>
                      <motion.p 
                        className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-blue-500 bg-clip-text text-transparent"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.4 }}
                      >
                        {stats.activeExpeditions}
                      </motion.p>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-0 bg-blue-500/20 blur-xl scale-150" />
                      <div className="relative h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-500/30 flex items-center justify-center shadow-lg group-hover:shadow-blue-500/30 transition-all duration-300">
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
            </motion.div>

            {/* Completed Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.3 }}
              whileHover={{ scale: 1.05, y: -5 }}
              className="group"
            >
              <Card className="relative overflow-hidden border-green-500/30 shadow-lg hover:shadow-2xl transition-all duration-300 bg-gradient-to-br from-card via-card/95 to-green-500/5">
                <div className="absolute inset-0 bg-gradient-to-br from-green-500/10 via-green-500/5 to-transparent opacity-50" />
                <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-green-500/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
                <div className="relative p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                        Completed
                      </p>
                      <motion.p 
                        className="text-4xl font-bold bg-gradient-to-r from-green-600 to-green-500 bg-clip-text text-transparent"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.5 }}
                      >
                        {stats.completedExpeditions}
                      </motion.p>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-0 bg-green-500/20 blur-xl scale-150" />
                      <div className="relative h-14 w-14 rounded-2xl bg-gradient-to-br from-green-500/20 to-green-500/30 flex items-center justify-center shadow-lg group-hover:shadow-green-500/30 transition-all duration-300">
                        <CheckCircle2 className="h-7 w-7 text-green-500" />
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>

            {/* Success Rate Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.4 }}
              whileHover={{ scale: 1.05, y: -5 }}
              className="group"
            >
              <Card className="relative overflow-hidden border-purple-500/30 shadow-lg hover:shadow-2xl transition-all duration-300 bg-gradient-to-br from-card via-card/95 to-purple-500/5">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-transparent opacity-50" />
                <div className="absolute -right-8 -bottom-8 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-500" />
                <div className="relative p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                        Success Rate
                      </p>
                      <div className="flex items-baseline gap-1">
                        <motion.p 
                          className="text-4xl font-bold bg-gradient-to-r from-purple-600 to-purple-500 bg-clip-text text-transparent"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.5, delay: 0.6 }}
                        >
                          {Math.round(stats.successRate)}
                        </motion.p>
                        <span className="text-xl text-purple-600 dark:text-purple-400 font-bold">%</span>
                      </div>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-0 bg-purple-500/20 blur-xl scale-150" />
                      <div className="relative h-14 w-14 rounded-2xl bg-gradient-to-br from-purple-500/20 to-purple-500/30 flex items-center justify-center shadow-lg group-hover:shadow-purple-500/30 transition-all duration-300">
                        <TrendingUp className="h-7 w-7 text-purple-500" />
                      </div>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="w-full bg-purple-500/10 rounded-full h-1.5">
                      <motion.div 
                        className="bg-gradient-to-r from-purple-500 to-purple-600 h-1.5 rounded-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${stats.successRate}%` }}
                        transition={{ duration: 1, delay: 0.8 }}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          </div>
        </motion.div>
      )}

      {/* Enhanced Filters and Search Section */}
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="p-8 border-b bg-gradient-to-br from-muted/10 via-background to-muted/5"
      >
        <div className="flex flex-col gap-6">
          {/* Search and Filter Row */}
          <div className="flex flex-col md:flex-row gap-4">
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="flex-1 relative group"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-primary/10 blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                <Input
                  placeholder="Search expeditions by name, mission, or agent..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-12 h-12 bg-card/80 backdrop-blur-sm border-border/50 hover:border-primary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300 text-base shadow-sm"
                />
                {searchQuery && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => setSearchQuery('')}
                  >
                    <XCircle className="h-4 w-4" />
                  </motion.button>
                )}
              </div>
            </motion.div>
            
            <motion.div whileHover={{ scale: 1.02 }}>
              <Select
                value={statusFilter}
                onValueChange={value => setStatusFilter(value as ExpeditionStatus | 'all')}
              >
                <SelectTrigger className="w-full md:w-64 h-12 bg-card/80 backdrop-blur-sm border-border/50 hover:border-primary/50 focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all duration-300 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Filter className="h-4 w-4 text-primary" />
                    </div>
                    <SelectValue placeholder="Filter by status" />
                  </div>
                </SelectTrigger>
                <SelectContent className="bg-card/95 backdrop-blur-xl border-border/50">
                  <SelectItem value="all" className="hover:bg-primary/10">
                    <div className="flex items-center gap-3">
                      <div className="h-3 w-3 rounded-full bg-gradient-to-r from-gray-400 to-gray-500" />
                      <span className="font-medium">All Expeditions</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="draft" className="hover:bg-primary/10">
                    <div className="flex items-center gap-3">
                      <div className="h-3 w-3 rounded-full bg-gradient-to-r from-slate-400 to-slate-500" />
                      <span className="font-medium">Draft</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="planning" className="hover:bg-primary/10">
                    <div className="flex items-center gap-3">
                      <div className="h-3 w-3 rounded-full bg-gradient-to-r from-blue-400 to-blue-500 animate-pulse" />
                      <span className="font-medium">Planning</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="in-progress" className="hover:bg-primary/10">
                    <div className="flex items-center gap-3">
                      <div className="h-3 w-3 rounded-full bg-gradient-to-r from-amber-400 to-amber-500 animate-pulse" />
                      <span className="font-medium">In Progress</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="review" className="hover:bg-primary/10">
                    <div className="flex items-center gap-3">
                      <div className="h-3 w-3 rounded-full bg-gradient-to-r from-purple-400 to-purple-500" />
                      <span className="font-medium">Review</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="completed" className="hover:bg-primary/10">
                    <div className="flex items-center gap-3">
                      <div className="h-3 w-3 rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500" />
                      <span className="font-medium">Completed</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="failed" className="hover:bg-primary/10">
                    <div className="flex items-center gap-3">
                      <div className="h-3 w-3 rounded-full bg-gradient-to-r from-red-400 to-red-500" />
                      <span className="font-medium">Failed</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="cancelled" className="hover:bg-primary/10">
                    <div className="flex items-center gap-3">
                      <div className="h-3 w-3 rounded-full bg-gradient-to-r from-gray-400 to-gray-500" />
                      <span className="font-medium">Cancelled</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </motion.div>
          </div>

          {/* Enhanced Status Badges */}
          {Object.keys(statusCounts).length > 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.3 }}
              className="flex flex-wrap gap-3"
            >
              {Object.entries(statusCounts).map(([status, count], index) => {
                const statusConfig = {
                  draft: {
                    className:
                      'bg-gradient-to-r from-slate-500/10 to-slate-500/20 text-slate-700 dark:text-slate-300 border-slate-500/30',
                    dotColor: 'from-slate-400 to-slate-500',
                  },
                  planning: {
                    className: 'bg-gradient-to-r from-blue-500/10 to-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30',
                    dotColor: 'from-blue-400 to-blue-500',
                  },
                  'in-progress': {
                    className:
                      'bg-gradient-to-r from-amber-500/10 to-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30',
                    dotColor: 'from-amber-400 to-amber-500',
                  },
                  review: {
                    className:
                      'bg-gradient-to-r from-purple-500/10 to-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/30',
                    dotColor: 'from-purple-400 to-purple-500',
                  },
                  completed: {
                    className:
                      'bg-gradient-to-r from-emerald-500/10 to-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
                    dotColor: 'from-emerald-400 to-emerald-500',
                  },
                  failed: {
                    className: 'bg-gradient-to-r from-red-500/10 to-red-500/20 text-red-700 dark:text-red-300 border-red-500/30',
                    dotColor: 'from-red-400 to-red-500',
                  },
                  cancelled: {
                    className: 'bg-gradient-to-r from-gray-500/10 to-gray-500/20 text-gray-700 dark:text-gray-300 border-gray-500/30',
                    dotColor: 'from-gray-400 to-gray-500',
                  },
                }[status] || {
                  className: 'bg-gradient-to-r from-gray-500/10 to-gray-500/20 text-gray-700 dark:text-gray-300 border-gray-500/30',
                  dotColor: 'from-gray-400 to-gray-500',
                }

                return (
                  <motion.button
                    key={status}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.3, delay: 0.1 * index }}
                    whileHover={{ scale: 1.05, y: -2 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setStatusFilter(status as ExpeditionStatus)}
                    className={`group inline-flex items-center gap-2.5 px-4 py-2 rounded-xl text-sm font-semibold ${statusConfig.className} border backdrop-blur-sm shadow-sm hover:shadow-md transition-all duration-300`}
                  >
                    <div className={`h-2.5 w-2.5 rounded-full bg-gradient-to-r ${statusConfig.dotColor} group-hover:scale-125 transition-transform`} />
                    <span>{status.charAt(0).toUpperCase() + status.slice(1).replace('-', ' ')}</span>
                    <span className="ml-1 px-2 py-0.5 bg-white/20 dark:bg-black/20 rounded-md text-xs font-bold">
                      {count as number}
                    </span>
                  </motion.button>
                )
              })}
            </motion.div>
          )}
        </div>
      </motion.div>

      {/* Expeditions List with Enhanced States */}
      <div className="flex-1 p-8 overflow-auto bg-gradient-to-b from-background via-background/95 to-muted/10">
        {expeditionsLoading || !starshipId ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="grid gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
          >
            {[...Array(6)].map((_, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
              >
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
              </motion.div>
            ))}
          </motion.div>
        ) : expeditionsError ? (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', duration: 0.5 }}
            className="flex items-center justify-center min-h-[400px]"
          >
            <Card className="p-8 text-center max-w-md bg-gradient-to-br from-red-500/5 to-red-500/10 border-red-200 dark:border-red-800 shadow-xl">
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
          </motion.div>
        ) : filteredExpeditions.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', duration: 0.5 }}
            className="flex items-center justify-center min-h-[400px]"
          >
            <Card className="p-10 text-center max-w-lg bg-gradient-to-br from-card via-card/95 to-primary/5 border-primary/20 shadow-xl">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', delay: 0.2, duration: 0.5 }}
                className="relative mb-6"
              >
                <div className="absolute inset-0 bg-primary/20 blur-3xl" />
                <div className="relative w-24 h-24 bg-gradient-to-br from-primary/20 to-primary/30 rounded-3xl flex items-center justify-center mx-auto shadow-lg">
                  <Rocket className="h-12 w-12 text-primary" />
                </div>
              </motion.div>
              
              <motion.h3 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-2xl font-bold mb-3 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent"
              >
                {(expeditions || []).length === 0 ? 'Launch Your First Expedition' : 'No Matching Expeditions'}
              </motion.h3>
              
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-muted-foreground mb-6 text-base leading-relaxed"
              >
                {(expeditions || []).length === 0
                  ? 'Begin your journey by creating an expedition. Set missions, assign agents, and explore new frontiers.'
                  : searchQuery || statusFilter !== 'all'
                  ? 'Try adjusting your search criteria or filters to find expeditions.'
                  : 'No expeditions match your current filters.'}
              </motion.p>
              
              {(expeditions || []).length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                >
                  <Button 
                    onClick={handleCreateExpedition}
                    size="lg"
                    className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all duration-300"
                  >
                    <Plus className="h-5 w-5 mr-2" />
                    Create Your First Expedition
                  </Button>
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="flex gap-3 justify-center"
                >
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
                </motion.div>
              )}
            </Card>
          </motion.div>
        ) : (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="grid gap-6 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 auto-rows-fr"
          >
            {filteredExpeditions.map((expedition, index) => (
              <motion.div
                key={expedition.id}
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ 
                  duration: 0.5, 
                  delay: index * 0.08, 
                  type: 'spring', 
                  stiffness: 100,
                  damping: 15
                }}
                layout
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
          </motion.div>
        )}
      </div>

      {/* Floating Action Button for Quick Creation */}
      {!expeditionsLoading && starshipId && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ 
            type: 'spring', 
            stiffness: 260, 
            damping: 20,
            delay: 0.5
          }}
          className="fixed bottom-8 right-8 z-50"
        >
          <motion.div
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="relative group"
          >
            {/* Glow effect */}
            <div className="absolute inset-0 bg-primary/40 rounded-full blur-xl group-hover:bg-primary/60 transition-all duration-300" />
            
            {/* Main button */}
            <Button
              onClick={handleCreateExpedition}
              size="lg"
              className="relative h-16 w-16 rounded-full bg-gradient-to-br from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 shadow-2xl shadow-primary/30 hover:shadow-primary/40 transition-all duration-300 p-0"
              aria-label="Create new expedition"
            >
              <Plus className="h-6 w-6" />
            </Button>
            
            {/* Tooltip */}
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 0, x: 10 }}
              whileHover={{ opacity: 1, x: 0 }}
              className="absolute right-full mr-4 top-1/2 -translate-y-1/2 pointer-events-none"
            >
              <div className="bg-foreground text-background px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap shadow-lg">
                Create New Expedition
                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-full">
                  <div className="border-8 border-transparent border-l-foreground" />
                </div>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      )}

      {/* Create Expedition Modal */}
      <CreateExpeditionModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onExpeditionCreated={handleExpeditionCreated}
        starshipId={starshipId}
        starshipSlug={slug}
      />
    </motion.div>
  )
}
