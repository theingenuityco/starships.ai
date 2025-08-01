'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  ArrowLeft, Zap, Loader2, Activity, 
  Gauge, Battery
} from 'lucide-react'
import '@/styles/animations.css'
import Link from 'next/link'
import { starshipAPI, Starship } from '@/lib/api'

interface DriveContentProps {
  slug: string
}

export function DriveContent({ slug }: DriveContentProps) {
  const [starship, setStarship] = useState<Starship | null>(null)
  const [starshipLoading, setStarshipLoading] = useState(true)
  const [powerOutput, setPowerOutput] = useState(0)
  const [efficiency, setEfficiency] = useState(0)

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
                  <div className="absolute inset-0 bg-yellow-500/5 blur-sm" />
                  <div className="relative bg-gradient-to-br from-yellow-500/15 to-yellow-500/10 p-3 rounded-xl shadow-sm border border-yellow-500/15">
                    <Zap className="h-6 w-6 text-yellow-500" />
                  </div>
                </div>
                <div className="flex flex-col">
                  <h1 className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                    Drive Systems
                  </h1>
                  <p className="text-sm text-muted-foreground">Propulsion and navigation control</p>
                </div>
              </div>

              <div className="h-10 w-px bg-gradient-to-b from-transparent via-border/60 to-transparent" />

              {/* Stats Cards */}
              <div className="flex items-center gap-3">
                <Card className="bg-card/60 backdrop-blur-sm border-border/40 shadow-sm">
                  <CardContent className="p-2">
                    <div className="flex items-center gap-2">
                      <Gauge className="h-3.5 w-3.5 text-yellow-500" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Power Output</p>
                        <p className="text-sm font-bold">{powerOutput}%</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-card/60 backdrop-blur-sm border-border/40 shadow-sm">
                  <CardContent className="p-2">
                    <div className="flex items-center gap-2">
                      <Battery className="h-3.5 w-3.5 text-yellow-500" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Efficiency</p>
                        <p className="text-sm font-bold">{efficiency}%</p>
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
            <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 via-transparent to-orange-500/5 rounded-3xl" />
            <div className="absolute top-10 left-10 w-20 h-20 bg-yellow-500/10 rounded-full blur-2xl" />
            <div className="absolute bottom-10 right-10 w-32 h-32 bg-orange-500/10 rounded-full blur-3xl" />
            
            <Card className="relative overflow-hidden bg-card/80 backdrop-blur-sm border-border/50 shadow-2xl">
              <CardHeader className="pb-8 pt-8">
                <div className="text-center space-y-4">
                  <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-yellow-500/20 to-orange-500/20 rounded-2xl mb-4">
                    <Zap className="h-10 w-10 text-yellow-500" />
                  </div>
                  <CardTitle className="text-3xl font-bold bg-gradient-to-r from-yellow-500 to-orange-500 bg-clip-text text-transparent">
                    Drive Systems Under Construction
                  </CardTitle>
                  <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                    Our engineering team is working on advanced propulsion and navigation systems
                  </p>
                </div>
              </CardHeader>
              <CardContent className="pb-12">
                <div className="relative">
                  {/* Animated illustration placeholder */}
                  <div className="relative h-64 mb-8 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-hidden">
                    {/* Stars background */}
                    <div className="absolute inset-0 opacity-50">
                      <div className="absolute top-10 left-20 w-1 h-1 bg-white rounded-full animate-pulse" />
                      <div className="absolute top-20 right-30 w-1 h-1 bg-white rounded-full animate-pulse delay-100" />
                      <div className="absolute bottom-20 left-40 w-1 h-1 bg-white rounded-full animate-pulse delay-200" />
                      <div className="absolute top-40 right-20 w-1 h-1 bg-white rounded-full animate-pulse delay-300" />
                      <div className="absolute bottom-30 right-50 w-1 h-1 bg-white rounded-full animate-pulse delay-500" />
                    </div>
                    
                    {/* Spaceship illustration */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="relative">
                        {/* Spaceship body */}
                        <div className="w-32 h-20 bg-gradient-to-r from-slate-600 to-slate-700 rounded-full transform rotate-12 animate-float">
                          <div className="absolute top-2 left-4 w-6 h-6 bg-cyan-400/30 rounded-full blur-sm" />
                          <div className="absolute bottom-2 right-4 w-4 h-4 bg-yellow-400/30 rounded-full blur-sm" />
                        </div>
                        
                        {/* Astronaut working on ship */}
                        <div className="absolute -top-8 left-8 transform -rotate-12 animate-float-delayed">
                          <div className="w-8 h-8 bg-white rounded-full">
                            <div className="w-6 h-6 bg-slate-800 rounded-full mt-1 ml-1" />
                          </div>
                          <div className="w-6 h-8 bg-white rounded-lg mt-1 ml-1" />
                          {/* Wrench */}
                          <div className="absolute -right-2 top-6 w-4 h-1 bg-slate-400 transform rotate-45" />
                        </div>
                        
                        {/* Engine flames */}
                        <div className="absolute -bottom-2 -left-6 w-8 h-12 bg-gradient-to-b from-yellow-400 via-orange-500 to-red-500 opacity-80 blur-lg animate-pulse" />
                      </div>
                    </div>
                    
                    {/* Progress indicator */}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 backdrop-blur-sm p-4">
                      <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
                        <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                        <span>Systems under maintenance</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Feature list */}
                  <div className="grid md:grid-cols-3 gap-6 mb-8">
                    <div className="text-center space-y-2">
                      <div className="inline-flex items-center justify-center w-12 h-12 bg-yellow-500/10 rounded-xl mb-2">
                        <Gauge className="h-6 w-6 text-yellow-500" />
                      </div>
                      <h4 className="font-semibold">Propulsion Control</h4>
                      <p className="text-sm text-muted-foreground">Advanced thrust management systems</p>
                    </div>
                    <div className="text-center space-y-2">
                      <div className="inline-flex items-center justify-center w-12 h-12 bg-orange-500/10 rounded-xl mb-2">
                        <Activity className="h-6 w-6 text-orange-500" />
                      </div>
                      <h4 className="font-semibold">Navigation Systems</h4>
                      <p className="text-sm text-muted-foreground">Quantum navigation algorithms</p>
                    </div>
                    <div className="text-center space-y-2">
                      <div className="inline-flex items-center justify-center w-12 h-12 bg-red-500/10 rounded-xl mb-2">
                        <Battery className="h-6 w-6 text-red-500" />
                      </div>
                      <h4 className="font-semibold">Energy Management</h4>
                      <p className="text-sm text-muted-foreground">Efficient power distribution</p>
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-r from-yellow-500/10 via-orange-500/10 to-red-500/10 rounded-2xl p-6 text-center border border-yellow-500/20">
                    <p className="text-sm text-muted-foreground mb-2">
                      🚧 Currently under development
                    </p>
                    <p className="text-lg font-semibold text-foreground">
                      Drive Systems will be operational soon
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