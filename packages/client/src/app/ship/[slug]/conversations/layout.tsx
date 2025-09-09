'use client'

export default function ConversationsLayout({ children }: { children: React.ReactNode }) {
  // Since conversation list is now integrated into the navigation component,
  // this layout just needs to render the children without a separate sidebar
  return <div className="h-screen w-full">{children}</div>
}
