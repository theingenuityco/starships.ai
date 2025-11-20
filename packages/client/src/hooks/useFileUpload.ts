import { getCurrentToken } from '@/lib/api'
import type { ApiResponse, Attachment } from '@starships/protocol'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

// Allowed MIME types (must match backend validation)
// Images: Sent as image_url blocks (vision models)
// PDFs: Sent as file blocks (OpenRouter parses for any model)
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
] as const

export interface PendingFile {
  file: File
  id: string
  preview?: string
  uploading?: boolean
  uploaded?: boolean
  attachmentId?: string
  error?: string
}

/**
 * Upload file attachment to conversation
 * Uses React Query mutation for consistency with codebase patterns
 * Note: Uses raw fetch instead of api helper because FormData needs special handling
 */
export function useUploadAttachment() {
  return useMutation({
    mutationFn: async ({ file, conversationId }: { file: File; conversationId: string }): Promise<Attachment> => {
      // Validate MIME type
      if (!ALLOWED_MIME_TYPES.includes(file.type as any)) {
        throw new Error(
          `File type "${file.type}" not supported. Allowed: Images (JPEG, PNG, GIF, WebP) and PDFs only.`
        )
      }

      // Validate size
      if (file.size > MAX_FILE_SIZE) {
        throw new Error(`File "${file.name}" exceeds 20MB limit`)
      }

      const formData = new FormData()
      formData.append('file', file)

      const token = await getCurrentToken()
      
      // Use raw fetch for multipart/form-data (api helper defaults to JSON)
      const response = await fetch(`/api/v1/conversations/${conversationId}/attachments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          // Don't set Content-Type - browser will set it with boundary for multipart/form-data
        },
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: { message: 'Upload failed' } }))
        throw new Error(errorData?.error?.message || 'Upload failed')
      }

      const result: ApiResponse<Attachment> = await response.json()
      return result.data
    },
    onError: (error: any, variables) => {
      const errorMessage = error?.message || 'Upload failed'
      toast.error(`Failed to upload ${variables.file.name}`, {
        description: errorMessage,
      })
    },
  })
}

/**
 * Legacy hook for backward compatibility
 * Wraps the mutation hook with a simpler interface
 */
export function useFileUpload() {
  const uploadMutation = useUploadAttachment()

  const uploadFile = async (file: File, conversationId: string): Promise<Attachment | null> => {
    try {
      return await uploadMutation.mutateAsync({ file, conversationId })
    } catch (error) {
      return null
    }
  }

  const uploadMultipleFiles = async (files: File[], conversationId: string): Promise<Attachment[]> => {
    const results: Attachment[] = []

    for (const file of files) {
      const result = await uploadFile(file, conversationId)
      if (result) {
        results.push(result)
      }
    }

    return results
  }

  return {
    uploading: uploadMutation.isPending,
    uploadProgress: 0, // Note: Progress tracking would need custom implementation with axios
    error: uploadMutation.error?.message || null,
    uploadFile,
    uploadMultipleFiles,
  }
}

/**
 * Fetch attachment metadata with presigned URLs
 *
 * STRATEGY: Refetch before presigned URLs expire to prevent broken images
 * - Presigned URLs expire after 15 minutes (900s)
 * - We refetch every 12 minutes to get fresh URLs before expiry
 * - Also refetch when user returns to window (for long-inactive sessions)
 */
export function useMessageAttachments(attachmentIds: string[] | undefined, starshipId: string | undefined) {
  return useQuery({
    queryKey: ['attachments', 'batch', attachmentIds?.join(','), starshipId],
    queryFn: async (): Promise<Attachment[]> => {
      if (!attachmentIds || attachmentIds.length === 0 || !starshipId) {
        return []
      }

      const token = await getCurrentToken()
      const idsParam = attachmentIds.join(',')

      const response = await fetch(`/api/v1/attachments?ids=${encodeURIComponent(idsParam)}&starshipId=${encodeURIComponent(starshipId)}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })

      if (!response.ok) {
        throw new Error('Failed to fetch attachments')
      }

      const result: ApiResponse<Attachment[]> = await response.json()
      return result.data
    },
    enabled: !!attachmentIds && attachmentIds.length > 0 && !!starshipId,
    staleTime: 12 * 60 * 1000, // 12 minutes (refetch before 15-minute URL expiry)
    gcTime: 15 * 60 * 1000, // 15 minutes (keep in cache while URLs are valid)
    refetchOnWindowFocus: true, // Refetch when user returns to prevent stale URLs
    refetchOnReconnect: true, // Refetch after network reconnection
  })
}

/**
 * Get preview URL for an attachment (proxied through server)
 * Security: Never exposes S3 URLs to client
 */
export function getAttachmentPreviewUrl(attachmentId: string, starshipId: string): string {
  return `/api/v1/attachments/${attachmentId}/preview?starshipId=${encodeURIComponent(starshipId)}`
}
