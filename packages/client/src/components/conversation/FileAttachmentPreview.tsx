'use client'

import { useEffect, useState } from 'react'
import Icon from '@/components/primitives/Icon'
import { cn } from '@/lib/utils'
import type { PendingFile } from '@/hooks/useFileUpload'

interface FileAttachmentPreviewProps {
  file: PendingFile
  onRemove: () => void
  uploading?: boolean
  uploadProgress?: number
  minimal?: boolean
}

export function FileAttachmentPreview({ file, onRemove, uploading, uploadProgress, minimal = false }: FileAttachmentPreviewProps) {
  const [preview, setPreview] = useState<string | null>(null)

  // Generate preview for images
  useEffect(() => {
    if (file.file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onloadend = () => {
        setPreview(reader.result as string)
      }
      reader.readAsDataURL(file.file)
    }
    return () => {
      if (preview) {
        URL.revokeObjectURL(preview)
      }
    }
  }, [file.file, preview])

  const getFileIcon = (mimeType: string): string => {
    if (mimeType.startsWith('image/')) return 'image'
    if (mimeType === 'application/pdf') return 'file-text'

    // Text files
    if (mimeType === 'text/plain' || mimeType === 'text/markdown' || mimeType === 'text/csv') return 'file-text'

    // Code files
    if (mimeType === 'application/json') return 'braces'
    if (mimeType === 'application/xml' || mimeType === 'text/xml') return 'code'
    if (mimeType === 'text/javascript' || mimeType === 'application/typescript') return 'code'
    if (mimeType.startsWith('text/x-')) return 'code' // Most code files
    if (mimeType === 'text/html' || mimeType === 'text/css') return 'code'
    if (mimeType === 'application/x-yaml') return 'file-text'

    // Default
    return 'file'
  }

  return (
    <div
      className={cn(
        'relative inline-flex items-center rounded-full border border-border/50 bg-muted/30',
        minimal ? 'gap-1.5 pl-0.5 pr-1.5 py-0.5' : 'gap-2 pl-1 pr-2 py-1',
        uploading && 'opacity-60',
        file.error && 'border-destructive/50 bg-destructive/10'
      )}
    >
      {/* Thumbnail or Icon */}
      <div className={cn(
        'flex-shrink-0 rounded-full overflow-hidden bg-background flex items-center justify-center',
        minimal ? 'w-6 h-6' : 'w-8 h-8'
      )}>
        {preview ? (
          <img src={preview} alt={file.file.name} className="w-full h-full object-cover" />
        ) : (
          <Icon name={getFileIcon(file.file.type)} className={cn(minimal ? 'w-3 h-3' : 'w-4 h-4', 'text-muted-foreground')} />
        )}
      </div>

      {/* File Name (truncated) */}
      <div className={cn('flex-1 min-w-0', minimal ? 'max-w-[100px]' : 'max-w-[120px]')}>
        <div className={cn('font-medium truncate text-foreground', minimal ? 'text-[11px]' : 'text-xs')}>{file.file.name}</div>
      </div>

      {/* Status Icon or Remove Button */}
      <div className="flex-shrink-0">
        {uploading ? (
          <Icon name="loading" className={cn(minimal ? 'w-3 h-3' : 'w-3.5 h-3.5', 'text-muted-foreground')} />
        ) : file.uploaded ? (
          <Icon name="check-circle" className={cn(minimal ? 'w-3 h-3' : 'w-3.5 h-3.5', 'text-green-500')} />
        ) : file.error ? (
          <Icon name="alert-circle" className={cn(minimal ? 'w-3 h-3' : 'w-3.5 h-3.5', 'text-destructive')} />
        ) : (
          <button
            onClick={onRemove}
            className="p-0.5 rounded-full hover:bg-muted/50 transition-colors"
            aria-label="Remove file"
          >
            <Icon name="x" className={cn(minimal ? 'w-3 h-3' : 'w-3.5 h-3.5', 'text-muted-foreground hover:text-foreground')} />
          </button>
        )}
      </div>
    </div>
  )
}
