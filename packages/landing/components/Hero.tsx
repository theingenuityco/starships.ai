'use client';

import { useEffect, useRef, useState } from 'react';
import { FadeIn } from './FadeIn';
import { HeroBackground } from './HeroBackground';

export function Hero() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasStartedRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [placeholderGone, setPlaceholderGone] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    function onReady() {
      setVideoReady(true);
    }

    function onTimeUpdate() {
      if (video!.duration) setProgress(video!.currentTime / video!.duration);
    }

    // iOS Safari won't fetch media data (or fire `loadeddata`) before a user
    // gesture, so we also treat `loadedmetadata`/`canplay` as ready. The poster
    // gives an instant preview frame regardless, and a fallback timer makes sure
    // the blurred placeholder never gets stuck if no media event ever fires.
    video.addEventListener('loadedmetadata', onReady);
    video.addEventListener('loadeddata', onReady);
    video.addEventListener('canplay', onReady);
    video.addEventListener('timeupdate', onTimeUpdate);
    if (video.readyState >= 1) setVideoReady(true);

    const fallback = setTimeout(() => setVideoReady(true), 2500);

    return () => {
      video.removeEventListener('loadedmetadata', onReady);
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('canplay', onReady);
      video.removeEventListener('timeupdate', onTimeUpdate);
      clearTimeout(fallback);
    };
  }, []);

  function handleEnded() {
    const video = videoRef.current;
    setPlaying(false);
    hasStartedRef.current = false;
    if (video) video.currentTime = 0;
  }

  function handleSeek(event: React.ChangeEvent<HTMLInputElement>) {
    const video = videoRef.current;
    if (!video || !video.duration) return;
    const ratio = Number(event.target.value) / 1000;
    video.currentTime = ratio * video.duration;
    setProgress(ratio);
  }

  function handlePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (playing) {
      video.pause();
      setPlaying(false);
    } else {
      if (!hasStartedRef.current) {
        video.currentTime = 0;
        hasStartedRef.current = true;
      }
      video.play();
      setPlaying(true);
    }
  }

  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-glow pointer-events-none" aria-hidden />
      <HeroBackground className="absolute inset-0 pointer-events-none" />

      {/* Bottom fade — dissolves the nebula into the page background so the hero
          blends seamlessly into the next section instead of cutting off hard */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-gradient-to-b from-transparent to-(--color-bg)"
        aria-hidden
      />

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
          <div className="relative aspect-video rounded-(--radius-card) overflow-hidden shadow-2xl shadow-black/40 bg-black/30">
            <video
              ref={videoRef}
              className="absolute inset-0 h-full w-full object-cover"
              src="/hero.mp4"
              poster="/hero-poster.jpg"
              playsInline
              preload="metadata"
              aria-label="Starships product walkthrough"
              onEnded={handleEnded}
            />

            {/* Blurry placeholder, fades out once the video frame is ready, then
                unmounts so its backdrop-filter layer stops being snapshotted on scroll */}
            {!placeholderGone && (
              <div
                onTransitionEnd={() => videoReady && setPlaceholderGone(true)}
                className={`absolute inset-0 backdrop-blur-2xl transition-opacity duration-700 pointer-events-none ${videoReady ? 'opacity-0' : 'opacity-100'}`}
              />
            )}

            {/* Play / pause overlay */}
            <button
              onClick={handlePlay}
              aria-label={playing ? 'Pause video' : progress > 0 ? 'Resume video' : 'Play video'}
              className="absolute inset-0 flex items-center group"
            >
              <span
                className={`absolute inset-0 bg-black/30 opacity-0 transition-opacity duration-500 pointer-events-none ${playing ? '' : 'group-hover:opacity-100'}`}
                aria-hidden
              />
              {!playing && (
                <span className="mx-auto flex w-full max-w-5xl px-6">
                  <span className="flex items-center gap-3 sm:gap-4 h-14 pl-5 pr-7 sm:h-24 sm:pl-6 sm:pr-10 rounded-full bg-white/10 backdrop-blur-sm text-white cursor-pointer transition-all duration-500 group-hover:scale-105">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="w-6 h-6 sm:w-10 sm:h-10 translate-x-0.5"
                      aria-hidden
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                    <span className="text-xl sm:text-3xl font-medium tracking-wide">{progress > 0 ? 'Resume' : 'Play'}</span>
                  </span>
                </span>
              )}
            </button>

            {/* Seek bar — appears once the video frame is ready. Sits above the
                full-area play/pause button so scrubbing doesn't toggle playback */}
            <div
              className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 px-4 pb-4 pt-12 bg-gradient-to-t from-black/40 to-transparent transition-opacity duration-500 ${videoReady ? 'opacity-100' : 'opacity-0'}`}
            >
              <input
                type="range"
                min={0}
                max={1000}
                value={Math.round(progress * 1000)}
                onChange={handleSeek}
                aria-label="Seek video"
                style={{
                  background: `linear-gradient(to right, white ${progress * 100}%, rgba(255,255,255,0.25) ${progress * 100}%)`,
                }}
                className="pointer-events-auto h-1 w-full cursor-pointer appearance-none rounded-full bg-white/25 transition-[height] hover:h-1.5 [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
              />
            </div>
          </div>
        </FadeIn>
      </div>
    </section>

  );
}
