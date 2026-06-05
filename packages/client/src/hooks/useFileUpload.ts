// Attachments/file-upload were removed in the org-layer pivot (no S3). No-op
// stubs keep the surviving UI compiling; avatar/attachment resolution returns empty.
export function useMessageAttachments(_ids?: unknown, _starshipId?: string) {
  return { data: [] as any[], isLoading: false, error: null }
}

export function useUploadAttachment() {
  return { mutate: () => undefined, mutateAsync: async () => null, isPending: false }
}

export function useFileUpload() {
  return {
    uploadFile: async () => null,
    uploadMultipleFiles: async () => [],
    isUploading: false,
  }
}
