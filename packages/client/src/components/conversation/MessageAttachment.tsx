import Icon from '@/components/primitives/Icon'
import type { Attachment } from '@starships/protocol'
import { isTextFile } from '@starships/protocol'
import { cn } from '@/lib/utils'
import { useState } from 'react'

interface MessageAttachmentProps {
  attachment: Attachment
  className?: string
}

/**
 * Display attachment preview
 * Shows images as thumbnails, PDFs and text files with file icon
 * Uses presigned S3 URLs for direct browser access (industry standard)
 */
export function MessageAttachment({ attachment, className }: MessageAttachmentProps) {
  const isImage = attachment.mimeType.startsWith('image/')
  const isPdf = attachment.mimeType === 'application/pdf'
  const isText = isTextFile(attachment.mimeType)
  const [imageError, setImageError] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)

  // Helper to get file icon based on MIME type
  const getFileIcon = (mimeType: string): string => {
    if (mimeType === 'application/pdf') return 'file-text'
    if (mimeType === 'application/json') return 'braces'
    if (mimeType === 'application/xml' || mimeType === 'text/xml') return 'code'
    if (mimeType === 'text/javascript' || mimeType === 'application/typescript') return 'code'
    if (mimeType.startsWith('text/x-')) return 'code'
    if (mimeType === 'text/html' || mimeType === 'text/css') return 'code'
    if (mimeType === 'text/csv') return 'file-csv'
    return 'file-text'
  }

  // Helper to get file type label
  const getFileTypeLabel = (mimeType: string): string => {
    if (mimeType === 'application/pdf') return 'PDF Document'
    if (mimeType === 'application/json') return 'JSON File'
    if (mimeType === 'text/javascript') return 'JavaScript File'
    if (mimeType === 'application/typescript') return 'TypeScript File'
    if (mimeType === 'text/x-python') return 'Python File'
    if (mimeType === 'text/x-java-source') return 'Java File'
    if (mimeType === 'text/x-c++') return 'C++ File'
    if (mimeType === 'text/x-c') return 'C File'
    if (mimeType === 'text/x-go') return 'Go File'
    if (mimeType === 'text/x-rust') return 'Rust File'
    if (mimeType === 'text/markdown') return 'Markdown File'
    if (mimeType === 'text/csv') return 'CSV File'
    if (mimeType === 'text/html') return 'HTML File'
    if (mimeType === 'text/css') return 'CSS File'
    if (mimeType === 'application/xml' || mimeType === 'text/xml') return 'XML File'
    if (mimeType === 'application/x-yaml') return 'YAML File'
    if (mimeType === 'text/plain') return 'Text File'
    return 'File'
  }

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
        download={attachment.filename}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'block rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity group relative',
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
            {/* Download icon overlay on hover */}
            <div className="absolute top-2 right-2 bg-background/80 backdrop-blur-sm rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <Icon name="download" className="w-4 h-4 text-foreground" />
            </div>
          </div>
        )}
      </a>
    )
  }

  // Handle PDFs and text files with download link
  if (isPdf || isText) {
    const iconName = getFileIcon(attachment.mimeType)
    const iconColor = isPdf ? 'text-red-600 dark:text-red-400' : 'text-blue-600 dark:text-blue-400'
    const fileTypeLabel = getFileTypeLabel(attachment.mimeType)

    if (!attachment.previewUrl) {
      return (
        <div className={cn(
          'flex items-center gap-3 p-4 rounded-lg bg-muted/10 border border-border',
          className
        )}>
          <Icon name={iconName} className={cn('w-10 h-10 flex-shrink-0', iconColor)} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{attachment.filename}</p>
            <p className="text-xs text-muted-foreground">{fileTypeLabel}</p>
          </div>
        </div>
      )
    }

    return (
      <a
        href={attachment.previewUrl}
        download={attachment.filename}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          'flex items-center gap-3 p-4 rounded-lg bg-muted/10 border border-border cursor-pointer hover:bg-muted/20 transition-all group',
          className
        )}
      >
        <Icon name={iconName} className={cn('w-10 h-10 flex-shrink-0', iconColor)} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{attachment.filename}</p>
          <p className="text-xs text-muted-foreground">{fileTypeLabel}</p>
        </div>
        <Icon name="download" className="w-5 h-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
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
