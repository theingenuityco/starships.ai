'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Zap } from 'lucide-react'
import Link from 'next/link'
import { starshipAPI } from '@/lib/api'

interface DrivePageContentProps {
  slug: string
}

export function DrivePageContent({ slug }: DrivePageContentProps) {
  const [starship, setStarship] = useState<any>(null)
  const [starshipLoading, setStarshipLoading] = useState(true)

  // Fetch starship data
  useEffect(() => {
    const fetchStarship = async () => {
      try {
        setStarshipLoading(true)
        const response = await starshipAPI.getStarshipBySlug(slug)
        setStarship(response.starship)
      } catch (error) {
        console.error('Failed to fetch starship:', error)
      } finally {
        setStarshipLoading(false)
      }
    }

    if (slug) {
      fetchStarship()
    }
  }, [slug])

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Professional Header */}
      <div className="flex items-center justify-between px-8 py-6 bg-gradient-to-r from-card/50 to-muted/30 border-b border-border/50 backdrop-blur-sm">
        <div className="flex items-center gap-6">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            asChild
          >
            <Link href="/">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Fleet
            </Link>
          </Button>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-primary/20 to-primary/10 p-2.5 rounded-lg shadow-sm border border-primary/20">
                <Zap className="h-5 w-5 text-primary" />
              </div>
              <div className="flex flex-col">
                <h1 className="text-xl font-bold text-foreground">Drive Systems</h1>
              </div>
            </div>

            <div className="h-8 w-px bg-border/60" />

            <div className="flex items-center gap-2">
              <div className="bg-muted/50 p-1.5 rounded-md">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-foreground">
                  {starshipLoading ? 'Loading...' : starship?.name || 'Unknown Starship'}
                </span>
                <span className="text-xs text-muted-foreground">Active Mission</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-xs text-muted-foreground">Drive Systems Online</div>
        </div>
      </div>

      <div className="flex-1 p-6">
        <div className="max-w-4xl mx-auto">
          {/* Main Content */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Zap className="h-5 w-5" />
                <span>Drive Systems</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <Zap className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-semibold mb-2">Drive Systems Control</h3>
                <p className="text-muted-foreground mb-4">
                  Advanced propulsion and navigation systems for {starship?.name || slug}
                </p>
                <div className="bg-muted p-4 rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    🚀 Coming Soon: Complete drive system interface with propulsion control,
                    navigation systems, and energy management.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
