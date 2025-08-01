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
      <div className="flex-1 p-4 overflow-hidden bg-gradient-to-b from-background to-background/95 flex items-center justify-center">
        <div className="w-full max-w-3xl">
          <div className="relative">
            {/* Decorative background elements */}
            <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/5 via-transparent to-orange-500/5 rounded-3xl" />
            <div className="absolute top-10 left-10 w-20 h-20 bg-yellow-500/10 rounded-full blur-2xl" />
            <div className="absolute bottom-10 right-10 w-32 h-32 bg-orange-500/10 rounded-full blur-3xl" />
            
            <Card className="relative overflow-hidden bg-card/80 backdrop-blur-sm border-border/50 shadow-2xl">
              <CardHeader className="pb-4 pt-4">
                <div className="text-center space-y-4">
                  <CardTitle className="text-2xl font-bold">
                    <span>🚧</span> <span className="bg-gradient-to-r from-yellow-500 to-orange-500 bg-clip-text text-transparent">Drive Systems Under Construction</span>
                  </CardTitle>
                  <p className="text-base text-muted-foreground max-w-2xl mx-auto">
                    Our engineering team is working on advanced propulsion and navigation systems
                  </p>
                </div>
              </CardHeader>
              <CardContent className="pb-6">
                <div className="relative">
                  {/* Animated illustration placeholder */}
                  <div className="relative h-48 mb-4 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-hidden">
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
                        <div className="absolute -top-12 left-8 transform animate-float-delayed">
                          <svg width="45" height="60" viewBox="0 0 60 80" fill="none" xmlns="http://www.w3.org/2000/svg">
                            {/* Astronaut body */}
                            <g>
                              {/* Backpack */}
                              <rect x="5" y="25" width="12" height="20" rx="2" fill="#4B5563" />
                              
                              {/* Main body */}
                              <rect x="15" y="20" width="25" height="35" rx="12" fill="#F3F4F6" />
                              
                              {/* Arms */}
                              <rect x="38" y="25" width="15" height="8" rx="4" fill="#F3F4F6" transform="rotate(25 38 25)" />
                              <rect x="2" y="30" width="15" height="8" rx="4" fill="#F3F4F6" transform="rotate(-15 2 30)" />
                              
                              {/* Legs */}
                              <rect x="18" y="50" width="8" height="20" rx="4" fill="#F3F4F6" />
                              <rect x="29" y="50" width="8" height="20" rx="4" fill="#F3F4F6" />
                              
                              {/* Helmet */}
                              <circle cx="27.5" cy="15" r="13" fill="#F3F4F6" stroke="#E5E7EB" strokeWidth="2" />
                              <circle cx="27.5" cy="15" r="10" fill="#1F2937" opacity="0.8" />
                              <path d="M20 12 Q27.5 8 35 12" stroke="#60A5FA" strokeWidth="1" opacity="0.5" />
                              
                              {/* Chest detail */}
                              <rect x="20" y="28" width="15" height="10" rx="2" fill="#DBEAFE" />
                              <circle cx="23" cy="33" r="1.5" fill="#3B82F6" />
                              <circle cx="27.5" cy="33" r="1.5" fill="#3B82F6" />
                              <circle cx="32" cy="33" r="1.5" fill="#3B82F6" />
                              
                              {/* Tool - wrench */}
                              <g transform="translate(45, 30) rotate(45)">
                                <rect x="0" y="0" width="15" height="3" fill="#6B7280" />
                                <circle cx="15" cy="1.5" r="3" fill="none" stroke="#6B7280" strokeWidth="3" />
                                <rect x="-3" y="-1" width="4" height="5" fill="#6B7280" />
                              </g>
                            </g>
                          </svg>
                        </div>
                        
                        {/* Engine flames */}
                        <div className="absolute -bottom-2 -left-6 w-8 h-12 bg-gradient-to-b from-yellow-400 via-orange-500 to-red-500 opacity-80 blur-lg animate-pulse" />
                      </div>
                    </div>
                    
                    {/* Progress indicator */}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 backdrop-blur-sm p-4">
                      <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
                        <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                        <span>System under maintenance</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Feature list */}
                  <div className="grid md:grid-cols-3 gap-4 mb-4">
                    <div className="text-center space-y-2">
                      <div className="inline-flex items-center justify-center w-10 h-10 bg-yellow-500/10 rounded-xl mb-1">
                        <Gauge className="h-5 w-5 text-yellow-500" />
                      </div>
                      <h4 className="font-semibold">Propulsion Control</h4>
                      <p className="text-sm text-muted-foreground">Advanced thrust management systems</p>
                    </div>
                    <div className="text-center space-y-2">
                      <div className="inline-flex items-center justify-center w-10 h-10 bg-orange-500/10 rounded-xl mb-1">
                        <Activity className="h-5 w-5 text-orange-500" />
                      </div>
                      <h4 className="font-semibold">Navigation Systems</h4>
                      <p className="text-sm text-muted-foreground">Quantum navigation algorithms</p>
                    </div>
                    <div className="text-center space-y-2">
                      <div className="inline-flex items-center justify-center w-10 h-10 bg-red-500/10 rounded-xl mb-1">
                        <Battery className="h-5 w-5 text-red-500" />
                      </div>
                      <h4 className="font-semibold">Energy Management</h4>
                      <p className="text-sm text-muted-foreground">Efficient power distribution</p>
                    </div>
                  </div>
                  
                  <div className="bg-gradient-to-r from-yellow-500/10 via-orange-500/10 to-red-500/10 rounded-2xl p-4 text-center border border-yellow-500/20">
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