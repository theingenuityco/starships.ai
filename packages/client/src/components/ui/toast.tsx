'use client'

import * as React from 'react'
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast, type Toast } from '@/hooks/useToast'

interface ToastProps {
  toast: Toast & { open?: boolean; onOpenChange?: (open: boolean) => void }
}

const getToastIcon = (variant?: string) => {
  switch (variant) {
    case 'success':
      return <CheckCircle className="h-4 w-4 text-green-600" />
    case 'destructive':
      return <AlertCircle className="h-4 w-4 text-red-600" />
    case 'warning':
      return <AlertTriangle className="h-4 w-4 text-yellow-600" />
    default:
      return <Info className="h-4 w-4 text-blue-600" />
  }
}

const getToastStyles = (variant?: string) => {
  switch (variant) {
    case 'success':
      return 'border-green-200 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-900/20 dark:text-green-100'
    case 'destructive':
      return 'border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-900/20 dark:text-red-100'
    case 'warning':
      return 'border-yellow-200 bg-yellow-50 text-yellow-900 dark:border-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-100'
    default:
      return 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-100'
  }
}

export function ToastComponent({ toast }: ToastProps) {
  const { dismiss } = useToast()

  return (
    <div
      className={cn(
        'group pointer-events-auto relative flex w-full items-start space-x-3 overflow-hidden rounded-md border p-4 shadow-lg transition-all',
        'animate-in slide-in-from-top-full duration-300',
        getToastStyles(toast.variant)
      )}
    >
      <div className="flex-shrink-0">{getToastIcon(toast.variant)}</div>

      <div className="flex-1 min-w-0">
        {toast.title && <div className="text-sm font-semibold mb-1">{toast.title}</div>}
        {toast.description && <div className="text-sm opacity-90">{toast.description}</div>}
        {toast.action && <div className="mt-2">{toast.action}</div>}
      </div>

      <button onClick={() => dismiss(toast.id)} className="flex-shrink-0 rounded-md p-1 hover:bg-black/10 focus:outline-none focus:ring-2 focus:ring-offset-2">
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

export function Toaster() {
  const { toasts } = useToast()

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col space-y-2 max-w-sm">
      {toasts.map(toast => (
        <ToastComponent key={toast.id} toast={toast} />
      ))}
    </div>
  )
}
