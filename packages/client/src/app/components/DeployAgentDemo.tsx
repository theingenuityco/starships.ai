'use client'

const DEPLOY_AGENTS_VIDEO_URL = 'https://www.youtube.com/embed/Iuzm9hPpU_w'

export default function DeployAgentDemo() {
  return (
    <div className="w-full">
      <div className="w-full max-w-3xl mx-auto rounded-3xl overflow-hidden border border-white/12 bg-black/40 shadow-xl aspect-video">
        <iframe
          src={`${DEPLOY_AGENTS_VIDEO_URL}?autoplay=1&mute=1&rel=0&playsinline=1&vq=hd1080&loop=1&playlist=Iuzm9hPpU_w`}
          title="Deploy agents demo"
          className="h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    </div>
  )
}

