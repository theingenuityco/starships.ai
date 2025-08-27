'use client'

import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { SibilChatInterface } from './SibilChatInterface'
import { SibilPageFloatingMessage } from './SibilPageFloatingMessage'
import { 
  ArrowLeft, Brain, Loader2, Activity, 
  MessageSquare, Info
} from 'lucide-react'
import Link from 'next/link'
import { starshipAPI, Starship } from '@/lib/api'
import { useStarshipStore } from '@/store/starship-store'

interface SibilContentProps {
  slug: string
}

export function SibilContent({ slug }: SibilContentProps) {
  const [starship, setStarship] = useState<Starship | null>(null)
  const [starshipLoading, setStarshipLoading] = useState(true)
  const {  } = useStarshipStore()
  
  // Floating message state
  const [showFloatingMessage, setShowFloatingMessage] = useState(false)
  const [isManualOpen, setIsManualOpen] = useState(false)
  const [animateInfoButton, setAnimateInfoButton] = useState(false)

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

  // Check if this is the user's first starship and show onboarding
  useEffect(() => {
    if (starship) {
      const dismissed = localStorage.getItem('sibil-page-message-dismissed')
      if (!dismissed) {
        setShowFloatingMessage(true)
      }
    }
  }, [starship])

  // Function to manually show the info modal
  const handleShowInfo = () => {
    setIsManualOpen(true)
    setShowFloatingMessage(true)
  }

  // Handle dismissing the floating message
  const handleDismissMessage = () => {
    setShowFloatingMessage(false)
    setIsManualOpen(false)
    // Animate the info button to show where the information is stored
    setAnimateInfoButton(true)
    setTimeout(() => setAnimateInfoButton(false), 2000)
  }

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
                  <div className="absolute inset-0 bg-emerald-500/5 blur-sm" />
                  <div className="relative bg-gradient-to-br from-emerald-500/15 to-emerald-500/10 p-3 rounded-xl shadow-sm border border-emerald-500/15">
                    <Brain className="h-6 w-6 text-emerald-500" />
                  </div>
                </div>
                <div className="flex flex-col">
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                      Sibil AI
                    </h1>
                    <button
                      onClick={handleShowInfo}
                      className="rounded-full p-0 hover:opacity-80 transition-all relative"
                      title="Sibil AI Guide"
                    >
                      <Info className={`h-6 w-6 text-emerald-500 transition-all ${
                        animateInfoButton ? 'scale-110' : ''
                      }`} />
                      {animateInfoButton && (
                        <span className="absolute inset-0 rounded-full bg-emerald-500/20 animate-ping-slow" />
                      )}
                    </button>
                  </div>
                  <p className="text-sm text-muted-foreground">Advanced AI intelligence assistant for strategic analysis and decision support</p>
                </div>
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

      {/* Main Content - Full Height Sibil Interface */}
      <div className="flex-1 overflow-hidden">
        <SibilChatInterface starshipId={starship?.id} />
      </div>

      {/* Sibil Page Floating Message */}
      <SibilPageFloatingMessage 
        show={showFloatingMessage} 
        onDismiss={handleDismissMessage}
        isManualOpen={isManualOpen}
      />
    </div>
  )
}