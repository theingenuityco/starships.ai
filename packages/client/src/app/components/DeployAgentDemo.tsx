'use client'

import { useEffect, useRef } from 'react'

const DEPLOY_AGENTS_VIDEO_ID = 'Iuzm9hPpU_w'

declare global {
  interface Window {
    YT?: any
    onYouTubeIframeAPIReady?: () => void
  }
}

export default function DeployAgentDemo() {
  const playerHostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let isCancelled = false
    let player: any = null

    const mountPlayer = () => {
      if (isCancelled) return
      if (!playerHostRef.current) return
      if (!window.YT?.Player) return

      player = new window.YT.Player(playerHostRef.current, {
        videoId: DEPLOY_AGENTS_VIDEO_ID,
        playerVars: {
          autoplay: 1,
          mute: 1,
          rel: 0,
          playsinline: 1,
          vq: 'hd1080',
          loop: 1,
          playlist: DEPLOY_AGENTS_VIDEO_ID,
        },
        events: {
          onReady: (event: any) => {
            try {
              event.target.setPlaybackRate(2)
              event.target.playVideo()
            } catch {
              // no-op
            }
          },
        },
      })
    }

    if (window.YT?.Player) {
      mountPlayer()
    } else {
      const existing = document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]')
      if (!existing) {
        const script = document.createElement('script')
        script.src = 'https://www.youtube.com/iframe_api'
        document.head.appendChild(script)
      }

      const prevReady = window.onYouTubeIframeAPIReady
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prevReady === 'function') prevReady()
        mountPlayer()
      }
    }

    return () => {
      isCancelled = true
      if (player && typeof player.destroy === 'function') {
        player.destroy()
      }
    }
  }, [])

  return (
    <div className="w-full">
      <div className="relative max-w-4xl mx-auto">
        {/* Browser-style frame */}
        <div className="relative rounded-[1.75rem] overflow-hidden border border-slate-900/15 bg-slate-950/70 backdrop-blur-xl shadow-[0_22px_60px_rgba(15,23,42,0.8)]">
          {/* Top chrome */}
          <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3 border-b border-white/10 bg-slate-900/80">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
            </div>
            <div className="hidden sm:flex flex-1 items-center justify-center">
              <div className="max-w-xs w-full rounded-full bg-slate-800/80 px-3 py-1 text-[11px] text-slate-200/80 text-center truncate">
                app.starships.ai / install-agent
              </div>
            </div>
            <div className="w-8 sm:w-10" />
          </div>

          {/* Video area */}
          <div className="aspect-video bg-black/90">
            <div ref={playerHostRef} className="h-full w-full" aria-label="Deploy agents demo video" />
          </div>
        </div>
      </div>
    </div>
  )
}

