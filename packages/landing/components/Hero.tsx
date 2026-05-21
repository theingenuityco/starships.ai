'use client';

import { useEffect, useRef, useState } from 'react';
import { FadeIn } from './FadeIn';
import { HeroBackground } from './HeroBackground';

export function Hero() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    function seekToPreview() {
      video!.currentTime = 2;
    }

    function onSeeked() {
      setVideoReady(true);
    }

    video.addEventListener('loadeddata', seekToPreview);
    video.addEventListener('seeked', onSeeked);
    if (video.readyState >= 2) seekToPreview();

    return () => {
      video.removeEventListener('loadeddata', seekToPreview);
      video.removeEventListener('seeked', onSeeked);
    };
  }, []);

  function handlePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (playing) {
      video.pause();
      setPlaying(false);
    } else {
      video.currentTime = 0;
      video.play();
      setPlaying(true);
    }
  }

  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-glow pointer-events-none" aria-hidden />
      <HeroBackground className="absolute inset-0 pointer-events-none" />

      <div className="relative mx-auto max-w-5xl px-6 pt-44 pb-12 sm:pt-52 sm:pb-16">
        <FadeIn delay={0}>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-semibold tracking-tight leading-[1.05] max-w-3xl">
            Starship. Your startup, on autopilot.
          </h1>
        </FadeIn>

        <FadeIn delay={120} className="mt-8 max-w-2xl">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-xl font-semibold tracking-tight">star&middot;ship</span>
            <span className="font-serif italic text-(--color-fg-muted)">/ ˈstɑːr.ʃɪp /</span>
            <span className="font-serif italic text-sm text-(--color-fg-muted)">noun</span>
          </div>
          <p className="mt-3 text-lg text-(--color-fg-muted) leading-relaxed">
            A new generation of startup, built natively around autonomous AI agents.
          </p>
          <p className="mt-3 font-serif italic text-(--color-fg-subtle)">
            &ldquo;The starship is to AI, what the startup was to the internet.&rdquo;
          </p>
        </FadeIn>
      </div>

      <div className="relative mx-auto max-w-7xl px-6 pb-16 sm:pb-24">
        <FadeIn delay={260}>
          <div className="relative aspect-video rounded-(--radius-card) overflow-hidden shadow-2xl shadow-black/40">
            <video
              ref={videoRef}
              className="absolute inset-0 h-full w-full object-cover"
              src="https://cdn.monaco.com/landing/public/pages/home/hero-video.webm"
              loop
              playsInline
              preload="auto"
              aria-label="Starships product walkthrough"
              onEnded={() => setPlaying(false)}
            />

            {/* Blurry placeholder — fades out once the video frame is ready */}
            <div
              className={`absolute inset-0 backdrop-blur-2xl transition-opacity duration-700 pointer-events-none ${videoReady ? 'opacity-0' : 'opacity-100'}`}
            />

            {/* Play / pause overlay */}
            <button
              onClick={handlePlay}
              aria-label={playing ? 'Pause video' : 'Play video'}
              className="absolute inset-0 flex items-center justify-center group"
            >
              {!playing && (
                <span className={`flex items-center justify-center w-24 h-24 rounded-full bg-white/10 backdrop-blur-sm text-white transition-all duration-500 group-hover:scale-110 ${videoReady ? 'opacity-100' : 'opacity-0'}`}>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="w-14 h-14 translate-x-0.5"
                    aria-hidden
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </span>
              )}
            </button>
          </div>
        </FadeIn>
      </div>
    </section>

  );
}
