'use client'

const DEPLOY_AGENTS_VIDEO_URL = 'https://www.youtube.com/embed/Iuzm9hPpU_w'

export default function DeployAgentDemo() {
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
            <iframe
              src={`${DEPLOY_AGENTS_VIDEO_URL}?autoplay=1&mute=1&rel=0&playsinline=1&vq=hd1080&loop=1&playlist=Iuzm9hPpU_w`}
              title="Deploy agents demo"
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
        </div>
      </div>
    </div>
  )
}

