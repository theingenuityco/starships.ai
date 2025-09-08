'use client'

import { ConversationInterface } from '@/components/conversation/ConversationInterface'
import { ConversationList } from '@/components/conversation/ConversationList'
import { Button } from '@/components/ui/button'
import { useDeleteConversation, useUpdateConversationStatus } from '@/hooks/useConversations'
import { useStarshipBySlug } from '@/hooks/useStarships'
import { cn } from '@/lib/utils'
import { Menu, Plus, X } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'

export default function ConversationsPage() {
  const params = useParams()
  const slug = params.slug as string
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
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

  // Handle conversation selection
  const handleConversationSelect = (conversationId: string) => {
    setSelectedConversationId(conversationId)
    // Close mobile sidebar when conversation is selected
    setIsMobileSidebarOpen(false)
  }

  // Handle conversation deletion
  const handleConversationDelete = async (conversationId: string) => {
    if (confirm('Are you sure you want to delete this conversation? This action cannot be undone.')) {
      try {
        await deleteConversation.mutateAsync(conversationId)

        // If we deleted the currently selected conversation, clear selection
        if (conversationId === selectedConversationId) {
          setSelectedConversationId(null)
        }

        toast.success('Conversation deleted successfully')
      } catch (error) {
        console.error('Failed to delete conversation:', error)
        toast.error('Failed to delete conversation')
      }
    }
  }

  // Handle conversation archive
  const handleConversationArchive = async (conversationId: string) => {
    try {
      await updateConversationStatus.mutateAsync({
        conversationId,
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
    setSelectedConversationId(null)
    setIsMobileSidebarOpen(false)
  }

  // Handle conversation change from ConversationInterface
  const handleConversationChange = (conversationId: string | null) => {
    setSelectedConversationId(conversationId)
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
            <ConversationList
              starshipId={starshipData.id}
              currentConversationId={selectedConversationId}
              onConversationSelect={handleConversationSelect}
              onConversationDelete={handleConversationDelete}
              onConversationArchive={handleConversationArchive}
            />
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

        <ConversationInterface starshipId={starshipData.id} conversationId={selectedConversationId} onConversationChange={handleConversationChange} />
      </main>
    </div>
  )
}
