'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  ArrowLeft, BookOpen, Loader2, Activity, 
  FileText, Archive, ScrollText, History, PenTool
} from 'lucide-react'
import '@/styles/animations.css'
import Link from 'next/link'
import { starshipAPI, Starship } from '@/lib/api'

interface LogbookContentProps {
  slug: string
}

export function LogbookContent({ slug }: LogbookContentProps) {
  const [starship, setStarship] = useState<Starship | null>(null)
  const [starshipLoading, setStarshipLoading] = useState(true)
  const [totalEntries, setTotalEntries] = useState(0)
  const [recentEntries, setRecentEntries] = useState(0)

  // Fetch starship data
  useEffect(() => {
    const fetchStarship = async () => {
      try {
        setStarshipLoading(true)
        const data = await starshipAPI.getStarshipBySlug(slug)
        setStarship(data.starship)
      } catch (error) {
        console.error('Failed to fetch starship:', error)
      } finally {
        setStarshipLoading(false)
      }
    }

    fetchStarship()
  }, [slug])

  return (
    <div className="h-full flex flex-col overflow-hidden bg-gradient-to-br from-background to-muted/5">
      {/* Enhanced Professional Header - Matching Crew Console Style */}
      <div className="relative overflow-hidden">
        {/* Background gradient effect - reduced opacity */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-primary/2 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-transparent to-primary/5" />
        
        <div className="relative flex items-center justify-between px-8 py-6 backdrop-blur-sm border-b border-border/40">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-foreground hover:bg-primary/10 transition-all -ml-2 px-2"
              asChild
            >
              <Link href="/fleet">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="absolute inset-0 bg-amber-500/5 blur-sm" />
                  <div className="relative bg-gradient-to-br from-amber-500/15 to-amber-500/10 p-3 rounded-xl shadow-sm border border-amber-500/15">
                    <BookOpen className="h-6 w-6 text-amber-500" />
                  </div>
                </div>
                <div className="flex flex-col">
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                    Logbook
                  </h1>
                  <p className="text-sm text-muted-foreground">Mission logs and historical records</p>
                </div>
              </div>

              <div className="h-10 w-px bg-gradient-to-b from-transparent via-border/60 to-transparent" />

              {/* Stats Cards */}
              <div className="flex items-center gap-3">
                <Card className="bg-card/60 backdrop-blur-sm border-border/40 shadow-sm">
                  <CardContent className="p-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-amber-500" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Total Entries</p>
                        <p className="text-sm font-bold">{totalEntries}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-card/60 backdrop-blur-sm border-border/40 shadow-sm">
                  <CardContent className="p-2">
                    <div className="flex items-center gap-2">
                      <Archive className="h-3.5 w-3.5 text-amber-500" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Recent</p>
                        <p className="text-sm font-bold">{recentEntries}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Starship info */}
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
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 overflow-auto bg-gradient-to-b from-background to-background/95">
        <div className="max-w-5xl mx-auto">
          <div className="relative">
            {/* Decorative background elements */}
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-brown-500/5 rounded-3xl" />
            <div className="absolute top-10 left-10 w-20 h-20 bg-amber-500/10 rounded-full blur-2xl" />
            <div className="absolute bottom-10 right-10 w-32 h-32 bg-brown-500/10 rounded-full blur-3xl" />
            
            <Card className="relative overflow-hidden bg-card/80 backdrop-blur-sm border-border/50 shadow-2xl">
              <CardHeader className="pb-8 pt-8">
                <div className="text-center space-y-4">
                  <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-amber-500/20 to-brown-500/20 rounded-2xl mb-4">
                    <BookOpen className="h-10 w-10 text-amber-500" />
                  </div>
                  <CardTitle className="text-3xl font-bold bg-gradient-to-r from-amber-500 to-amber-700 bg-clip-text text-transparent">
                    Logbook Archives Under Construction
                  </CardTitle>
                  <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                    Our archivists are digitizing mission logs and historical records
                  </p>
                </div>
              </CardHeader>
              <CardContent className="pb-12">
                <div className="relative">
                  {/* Animated illustration placeholder */}
                  <div className="relative h-64 mb-8 rounded-2xl bg-gradient-to-br from-amber-950 via-amber-900 to-amber-950 overflow-hidden">
                    {/* Background elements */}
                    <div className="absolute inset-0 opacity-20">
                      <div className="absolute top-5 left-10 w-32 h-1 bg-amber-700 transform rotate-12" />
                      <div className="absolute top-12 right-20 w-24 h-1 bg-amber-800 transform -rotate-6" />
                      <div className="absolute bottom-20 left-20 w-28 h-1 bg-amber-700 transform rotate-3" />
                    </div>
                    
                    {/* Book and astronaut illustration */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="relative">
                        {/* Large logbook */}
                        <div className="w-40 h-32 bg-gradient-to-br from-amber-800 to-amber-900 rounded transform perspective-1000 rotate-y-12 shadow-2xl">
                          <div className="absolute inset-2 bg-amber-700/50 rounded">
                            <div className="mt-2 ml-2 space-y-1">
                              <div className="w-20 h-1 bg-amber-600/50" />
                              <div className="w-24 h-1 bg-amber-600/50" />
                              <div className="w-16 h-1 bg-amber-600/50" />
                            </div>
                          </div>
                          <div className="absolute top-1/2 left-0 w-full h-0.5 bg-amber-950" />
                        </div>
                        
                        {/* Astronaut writing */}
                        <div className="absolute -top-6 right-0 transform scale-75 animate-float-delayed">
                          <div className="relative">
                            <div className="w-8 h-8 bg-white rounded-full">
                              <div className="w-6 h-6 bg-slate-800 rounded-full mt-1 ml-1" />
                            </div>
                            <div className="w-6 h-8 bg-white rounded-lg mt-1 ml-1" />
                            {/* Pen */}
                            <div className="absolute -right-3 top-6 w-5 h-1 bg-amber-400 transform rotate-45" />
                            <div className="absolute -right-4 top-5 w-2 h-2 bg-amber-300 rounded-full" />
                          </div>
                        </div>
                        
                        {/* Floating pages */}
                        <div className="absolute -top-4 -left-8 w-12 h-16 bg-amber-100 rounded shadow-lg transform rotate-12 animate-float opacity-80">
                          <div className="mt-2 ml-1 space-y-1">
                            <div className="w-8 h-0.5 bg-amber-900/30" />
                            <div className="w-6 h-0.5 bg-amber-900/30" />
                            <div className="w-7 h-0.5 bg-amber-900/30" />
                          </div>
                        </div>
                        
                        {/* Ink bottle */}
                        <div className="absolute bottom-0 -right-6 w-4 h-6 bg-slate-800 rounded-b-full">
                          <div className="absolute top-0 w-4 h-2 bg-slate-700 rounded-t" />
                        </div>
                      </div>
                    </div>
                    
                    {/* Progress indicator */}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 backdrop-blur-sm p-4">
                      <div className="flex items-center justify-center gap-2 text-xs text-amber-400">
                        <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
                        <span>Archives being digitized</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Feature list */}
                  <div className="grid md:grid-cols-3 gap-6 mb-8">
                    <div className="text-center space-y-2">
                      <div className="inline-flex items-center justify-center w-12 h-12 bg-amber-500/10 rounded-xl mb-2">
                        <ScrollText className="h-6 w-6 text-amber-500" />
                      </div>
                      <h4 className="font-semibold">Mission Logs</h4>
                      <p className="text-sm text-muted-foreground">Detailed expedition records</p>
                    </div>
                    <div className="text-center space-y-2">
                      <div className="inline-flex items-center justify-center w-12 h-12 bg-amber-600/10 rounded-xl mb-2">
                        <History className="h-6 w-6 text-amber-600" />
                      </div>
                      <h4 className="font-semibold">Historical Records</h4>
                      <p className="text-sm text-muted-foreground">Complete starship history</p>
                    </div>
                    <div className="text-center space-y-2">
                      <div className="inline-flex items-center justify-center w-12 h-12 bg-amber-700/10 rounded-xl mb-2">
                        <PenTool className="h-6 w-6 text-amber-700" />
                      </div>
                      <h4 className="font-semibold">Auto Generation</h4>
                      <p className="text-sm text-muted-foreground">AI-powered log entries</p>
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-r from-amber-500/10 via-amber-600/10 to-amber-700/10 rounded-2xl p-6 text-center border border-amber-500/20">
                    <p className="text-sm text-muted-foreground mb-2">
                      📚 Currently being archived
                    </p>
                    <p className="text-lg font-semibold text-foreground">
                      Logbook system will be available soon
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}