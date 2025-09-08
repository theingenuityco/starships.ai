'use client'

import { ConversationInterface } from '@/components/conversation/ConversationInterface'
import { ConversationList } from '@/components/conversation/ConversationList'
import { Button } from '@/components/ui/button'
import { useDeleteConversation, useUpdateConversationStatus } from '@/hooks/useConversations'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { cn } from '@/lib/utils'
import { Menu, Plus, X } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

export default function ConversationPage() {
  const params = useParams()
  const router = useRouter()
  const slug = params.slug as string
  const conversationId = params.conversationId as string
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)

  const { data: starshipData, isLoading, error } = useStarshipBySlug(slug)
  const deleteConversation = useDeleteConversation()
  const updateConversationStatus = useUpdateConversationStatus()

  // Show loading state while fetching starship data
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading starship...</p>
        </div>
      </div>
    )
  }

  // Show error state if starship fetch failed
  if (error || !starshipData) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-destructive mb-2">Failed to load starship</p>
          <p className="text-muted-foreground">Please check if the starship exists and try again.</p>
        </div>
      </div>
    )
  }

  // Handle conversation deletion
  const handleConversationDelete = async (conversationIdToDelete: string) => {
    if (confirm('Are you sure you want to delete this conversation? This action cannot be undone.')) {
      try {
        await deleteConversation.mutateAsync(conversationIdToDelete)

        // If we deleted the currently selected conversation, navigate to conversations root
        if (conversationIdToDelete === conversationId) {
          router.push(`/ship/${slug}/conversations`)
        }

        toast.success('Conversation deleted successfully')
      } catch (error) {
        console.error('Failed to delete conversation:', error)
        toast.error('Failed to delete conversation')
      }
    }
  }

  // Handle conversation archive
  const handleConversationArchive = async (conversationIdToArchive: string) => {
    try {
      await updateConversationStatus.mutateAsync({
        conversationId: conversationIdToArchive,
        status: 'archived',
      })
      toast.success('Conversation archived successfully')
    } catch (error) {
      console.error('Failed to archive conversation:', error)
      toast.error('Failed to archive conversation')
    }
  }

  // Handle new conversation
  const handleNewConversation = () => {
    router.push(`/ship/${slug}/conversations`)
  }

  // Handle conversation change from ConversationInterface
  const handleConversationChange = (newConversationId: string | null) => {
    if (newConversationId) {
      router.push(`/ship/${slug}/conversations/${newConversationId}`)
    } else {
      router.push(`/ship/${slug}/conversations`)
    }
  }

  return (
    <div className="h-screen overflow-hidden flex">
      {/* Mobile Overlay */}
      {isMobileSidebarOpen && <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setIsMobileSidebarOpen(false)} />}

      {/* Sidebar - Conversation List */}
      <aside
        className={cn(
          'flex-shrink-0 bg-background border-r transition-all duration-300',
          // Desktop styles
          'hidden lg:flex lg:flex-col',
          isSidebarOpen ? 'lg:w-80' : 'lg:w-0 lg:overflow-hidden',
          // Mobile styles
          'fixed lg:relative inset-y-0 left-0 z-50 w-80',
          isMobileSidebarOpen ? 'flex flex-col' : 'hidden'
        )}
      >
        <div className="h-full flex flex-col">
          {/* Header with New Conversation Button */}
          <div className="p-4 border-b flex items-center justify-between">
            <Button onClick={handleNewConversation} className="flex-1 mr-2" size="sm">
              <Plus className="w-4 h-4 mr-2" />
              New Conversation
            </Button>

            {/* Close button for mobile */}
            <Button onClick={() => setIsMobileSidebarOpen(false)} variant="ghost" size="icon" className="lg:hidden">
              <X className="w-4 h-4" />
            </Button>

            {/* Toggle button for desktop */}
            <Button onClick={() => setIsSidebarOpen(false)} variant="ghost" size="icon" className="hidden lg:flex">
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Conversation List */}
          <div className="flex-1 overflow-hidden">
            <ConversationList starshipId={starshipData.id} currentConversationId={conversationId} onConversationDelete={handleConversationDelete} onConversationArchive={handleConversationArchive} />
          </div>
        </div>
      </aside>

      {/* Main Content - Conversation Interface */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile/Desktop Toggle Button */}
        <div className="absolute left-2 top-2 z-30 flex gap-2">
          {/* Mobile menu button */}
          <Button onClick={() => setIsMobileSidebarOpen(true)} variant="ghost" size="icon" className="lg:hidden">
            <Menu className="w-5 h-5" />
          </Button>

          {/* Desktop sidebar toggle (when hidden) */}
          {!isSidebarOpen && (
            <Button onClick={() => setIsSidebarOpen(true)} variant="ghost" size="icon" className="hidden lg:flex">
              <Menu className="w-5 h-5" />
            </Button>
          )}
        </div>

        <ConversationInterface starshipId={starshipData.id} conversationId={conversationId} onConversationChange={handleConversationChange} />
      </main>
    </div>
  )
}
