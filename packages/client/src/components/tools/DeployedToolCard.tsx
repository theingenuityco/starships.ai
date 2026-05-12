'use client'

import Icon from '@/components/primitives/Icon'

import React from 'react'
import type { ToolModel } from '@starships/protocol'
import { motion } from 'motion/react'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface DeployedToolCardProps {
  tool: ToolModel
  onClick: () => void
  onOpen?: (tool: ToolModel) => void
  onEdit?: (tool: ToolModel) => void
  onDelete?: (tool: ToolModel) => void
  showActions?: boolean
}

export function DeployedToolCard({ tool, onClick, onOpen, onEdit, onDelete, showActions = false }: DeployedToolCardProps) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -4 }} transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }} className="h-full">
      <Card
        className="frosted-glass-card shadow-frosted-lg group relative overflow-hidden transition-all duration-300 cursor-pointer border border-border/50 hover:border-primary/50 backdrop-blur-xl h-full flex flex-col"
        onClick={onClick}
      >
        {/* Space-themed radial gradient overlay */}
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{
            backgroundImage: [
              'radial-gradient(ellipse 400px 300px at 50% 0%, rgba(113,113,122,0.18), transparent 60%)',
              'radial-gradient(ellipse 500px 350px at 50% 0%, rgba(113,113,122,0.12), transparent 65%)',
              'radial-gradient(ellipse 600px 400px at 50% 0%, rgba(113,113,122,0.08), transparent 70%)',
            ].join(', '),
          }}
        />

        {/* Space-themed decorative corner accent */}
        <div
          className="absolute top-0 right-0 w-24 h-24 rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 80px 80px at top right, rgba(113,113,122,0.25), transparent 70%)',
          }}
        />

        {/* Animated border glow on hover */}
        <div
          className="absolute inset-0 rounded-lg pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{
            border: '2px solid transparent',
            background: 'linear-gradient(hsl(var(--card)), hsl(var(--card))) padding-box, linear-gradient(135deg, rgba(113,113,122,0.25), rgba(113,113,122,0.35), rgba(113,113,122,0.25)) border-box',
          }}
        />

        {/* Shimmer effect on hover */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute inset-y-0 w-1/2 -translate-x-full group-hover:translate-x-[300%] transition-transform duration-700 ease-in-out"
            style={{
              background: 'linear-gradient(to right, transparent, rgba(113,113,122,0.12), rgba(113,113,122,0.08), transparent)',
            }}
          />
        </div>
        <CardHeader className="pb-3 relative z-10 pt-5">
          <div className="flex items-start gap-3 mb-3">
            {/* Enhanced wrench icon */}
            <div className="relative flex-shrink-0">
              {/* Animated glow ring - only on hover */}
              <motion.div
                className="absolute inset-0 rounded-full blur-xl pointer-events-none hidden group-hover:block"
                style={{
                  background: 'radial-gradient(circle, rgba(113,113,122,0.35), rgba(113,113,122,0.15), transparent 70%)',
                }}
                animate={{
                  scale: [1, 1.15, 1],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              />
              <div className="h-12 w-12 rounded-full ring-1 ring-border/40 flex items-center justify-center bg-muted/20 relative z-10 shadow-lg">
                <Icon name="wrench" className="w-5 h-5" />
              </div>
            </div>

            {/* Tool name and badges */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <CardTitle className="truncate text-lg font-bold transition-all duration-300 group-hover:text-primary">{tool.name}</CardTitle>
                {/* Show version badge next to name */}
                {tool.version && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 font-mono">
                    v{tool.version}
                  </Badge>
                )}
              </div>
              <CardDescription className="line-clamp-2 text-sm text-muted-foreground leading-relaxed group-hover:text-foreground/80 transition-colors duration-200">
                {tool.description || 'No description provided'}
              </CardDescription>
            </div>
          </div>

          {/* Actions button */}
          {showActions && onEdit && (
            <div className="absolute top-3 right-3 z-30">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 bg-background/80 hover:bg-background/90 backdrop-blur-sm rounded-full border border-border/40 hover:border-primary/50 transition-all duration-200 shadow-sm hover:shadow-md"
                onClick={e => {
                  e.stopPropagation()
                  onEdit(tool)
                }}
              >
                <Icon name="pencil" className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="relative z-10 pt-0 pb-4 mt-auto">
          <div className="flex items-center justify-between">
            <Badge variant="secondary" className="text-xs flex items-center gap-1.5 px-2.5 py-1 transition-all duration-200">
              <Icon name="fingerprint" className="w-3 h-3" />
              <span className="font-mono">{(tool as any)?.id?.slice?.(0, 6) || 'tool'}</span>
            </Badge>
            {onOpen ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-9 px-3 font-medium transition-all duration-200 text-primary/80 hover:text-primary hover:border-primary/25 hover:bg-primary/10 hover:shadow-sm"
                onClick={e => {
                  e.stopPropagation()
                  onOpen(tool)
                }}
              >
                <Icon name="external-link" className="mr-1.5 h-4 w-4 text-primary/80" />
                Open
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

export default DeployedToolCard
