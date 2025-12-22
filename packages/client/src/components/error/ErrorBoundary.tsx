'use client'

import React from 'react'

type ErrorBoundaryProps = {
  children: React.ReactNode
  name?: string
  fallback?: React.ReactNode
}

type ErrorBoundaryState = {
  hasError: boolean
  error?: unknown
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary]${this.props.name ? ` ${this.props.name}` : ''}`, error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    if (this.props.fallback) return this.props.fallback

    return (
      <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
        <div className="font-medium">This demo hit an error.</div>
        <div className="mt-1 text-xs text-red-200/80">Try reloading the page. If it persists, check the console for details.</div>
      </div>
    )
  }
}


