import Icon from '@/components/primitives/Icon'
import type { Attachment } from '@starships/protocol'
import { cn } from '@/lib/utils'
import { useState } from 'react'

interface MessageAttachmentProps {
  attachment: Attachment
  className?: string
}

/**
 * Display attachment preview
 * Shows images as thumbnails, PDFs with file icon
 * Uses presigned S3 URLs for direct browser access (industry standard)
 */
export function MessageAttachment({ attachment, className }: MessageAttachmentProps) {
  const isImage = attachment.mimeType.startsWith('image/')
  const isPdf = attachment.mimeType === 'application/pdf'
  const [imageError, setImageError] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)

  if (isImage) {
    if (!attachment.previewUrl) {
      return (
        <div className={cn(
          'flex items-center justify-center min-h-[200px] rounded-lg bg-muted/10',
          className
        )}>
          <Icon name="file" className="w-8 h-8 text-muted-foreground" />
        </div>
      )
    }

    return (
      <a
        href={attachment.previewUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'block rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity',
          className
        )}
      >
        {imageError ? (
          <div className="flex items-center justify-center min-h-[200px] p-4 bg-muted/10 rounded-lg">
            <Icon name="file" className="w-8 h-8 text-muted-foreground" />
          </div>
        ) : (
          <div className={cn(
            "relative rounded-lg bg-muted/10",
            !imageLoaded && "min-h-[200px]"
          )}>
            {!imageLoaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Icon name="loading" className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
            <img
              src={attachment.previewUrl}
              alt="Attachment"
              className={cn(
                "max-w-full h-auto max-h-96 object-contain rounded-lg transition-opacity duration-300",
                imageLoaded ? "opacity-100" : "opacity-0"
              )}
              loading="lazy"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
          </div>
        )}
      </a>
    )
  }

  if (isPdf) {
    if (!attachment.previewUrl) {
      return (
        <div className={cn(
          'flex items-center gap-3 p-4 rounded-lg bg-muted/10 border border-border',
          className
        )}>
          <Icon name="file-text" className="w-10 h-10 flex-shrink-0 text-red-600 dark:text-red-400" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{attachment.filename}</p>
            <p className="text-xs text-muted-foreground">PDF Document</p>
          </div>
        </div>
      )
    }

    return (
      <a
        href={attachment.previewUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'flex items-center gap-3 p-4 rounded-lg bg-muted/10 border border-border cursor-pointer hover:bg-muted/20 transition-all',
          className
        )}
      >
        <Icon name="file-text" className="w-10 h-10 flex-shrink-0 text-red-600 dark:text-red-400" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{attachment.filename}</p>
          <p className="text-xs text-muted-foreground">PDF Document</p>
        </div>
      </a>
    )
  }

  // Fallback for other file types
  return (
    <div className={cn(
      'flex items-center gap-3 p-4 rounded-lg bg-muted/10 border border-border',
      className
    )}>
      <Icon name="file" className="w-10 h-10 flex-shrink-0 text-muted-foreground" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{attachment.filename}</p>
        <p className="text-xs text-muted-foreground">{attachment.mimeType}</p>
      </div>
    </div>
  )
}

/**
 * Loading state for attachments
 */
export function MessageAttachmentSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center min-h-[200px] rounded-lg bg-muted/10', className)}>
      <Icon name="loading" className="w-6 h-6 text-muted-foreground" />
    </div>
  )
}
