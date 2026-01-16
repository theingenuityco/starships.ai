import Icon from '@/components/primitives/Icon'
import type { Attachment } from '@starships/protocol'
import { isTextFile } from '@starships/protocol'
import { cn } from '@/lib/utils'
import { useState } from 'react'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'

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
  const [open, setOpen] = useState(false)

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
          'flex items-center justify-center min-h-[160px] rounded-lg bg-muted/10',
          className
        )}>
          <Icon name="file" className="w-8 h-8 text-muted-foreground" />
        </div>
      )
    }

    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            // Small preview that shrink-wraps to the rendered image.
            // Keep cursor neutral on the wrapper; show pointer only when hovering the image container itself.
            'inline-block max-w-full rounded-lg overflow-hidden hover:opacity-95 transition-opacity group/attachment relative text-left cursor-default',
            className
          )}
        >
          {imageError ? (
            <div className="flex items-center justify-center min-h-[160px] p-4 bg-muted/10 rounded-lg cursor-pointer">
              <Icon name="file" className="w-8 h-8 text-muted-foreground" />
            </div>
          ) : (
            <div className={cn('relative inline-block max-w-full rounded-lg bg-muted/10 cursor-pointer', !imageLoaded && 'min-h-[160px]')}>
              {!imageLoaded && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <Icon name="loading" className="w-6 h-6 text-muted-foreground" />
                </div>
              )}
              <img
                src={attachment.previewUrl}
                alt={attachment.filename || 'Attachment'}
                className={cn(
                  // Thumbnail sizing: small preview in chat, but keep aspect ratio.
                  'block w-auto h-auto max-w-[420px] max-h-[320px] object-contain rounded-lg transition-opacity duration-300',
                  imageLoaded ? 'opacity-100' : 'opacity-0'
                )}
                loading="lazy"
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
              />
              {/* Fullscreen affordance on hover (dark overlay + centered icon) */}
              <div className="pointer-events-none absolute inset-0 rounded-lg bg-black/0 group-hover/attachment:bg-black/45 transition-colors" aria-hidden="true" />
              <div
                className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-0 group-hover/attachment:opacity-100 transition-opacity"
                aria-hidden="true"
              >
                <div className="rounded-full bg-black/40 backdrop-blur-sm ring-1 ring-white/20 p-3">
                  <Icon
                    name="fullscreen"
                    iconOverride={{ type: 'phosphor', component: 'ArrowsOut' }}
                    weight="bold"
                    className="h-6 w-6 text-white"
                  />
                </div>
              </div>
              <span className="sr-only">Open fullscreen preview</span>
            </div>
          )}
        </button>

        <DialogContent
          className={cn(
            // No "container": just the blurred overlay (DialogOverlay) + the centered image.
            // Override default DialogContent card styles from `components/ui/dialog.tsx`.
            // Also hide the default built-in close button from `DialogContent` so we can position our own.
            'bg-transparent border-0 shadow-none p-0 w-auto max-w-[96vw] overflow-visible [&>button]:hidden'
          )}
        >
          <DialogTitle className="sr-only">{attachment.filename || 'Image preview'}</DialogTitle>
          <div className="relative inline-block">
            <img
              src={attachment.previewUrl}
              alt={attachment.filename || 'Attachment'}
              className="block w-auto h-auto max-w-[96vw] max-h-[90vh] object-contain mx-auto"
              loading="eager"
            />
            <DialogClose
              className="absolute right-0 top-0 -translate-y-full -mt-2 inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-white/90 hover:text-white bg-black/35 hover:bg-black/50 backdrop-blur-sm ring-1 ring-white/15 transition-colors"
              aria-label="Close image preview"
            >
              <Icon name="close" iconOverride={{ type: 'phosphor', component: 'X' }} weight="bold" className="h-4 w-4 text-white" />
              <span>Close</span>
            </DialogClose>
          </div>
        </DialogContent>
      </Dialog>
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
