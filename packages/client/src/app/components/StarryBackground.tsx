'use client'

import { useMemo } from 'react'

// Generate random star positions
function generateStars(count: number, maxWidth: number, maxHeight: number) {
  return Array.from({ length: count }, () => ({
    x: Math.floor(Math.random() * maxWidth),
    y: Math.floor(Math.random() * maxHeight),
  }))
}

export default function StarryBackground() {
  // Generate stars once on mount
  const smallStars = useMemo(() => generateStars(80, 2000, 2000), [])
  const mediumStars = useMemo(() => generateStars(40, 2000, 2000), [])
  const largeStars = useMemo(() => generateStars(20, 2000, 2000), [])

  // Create box-shadow strings for each layer
  const smallStarsShadow = useMemo(
    () => smallStars.map(star => `${star.x}px ${star.y}px #fff`).join(', '),
    [smallStars]
  )
  const mediumStarsShadow = useMemo(
    () => mediumStars.map(star => `${star.x}px ${star.y}px #fff`).join(', '),
    [mediumStars]
  )
  const largeStarsShadow = useMemo(
    () => largeStars.map(star => `${star.x}px ${star.y}px #fff`).join(', '),
    [largeStars]
  )

  return (
    <>
      <div className="fixed inset-0 pointer-events-none z-0">
        {/* Stars layer 1 - Small stars */}
        <div className="stars-small" style={{ boxShadow: smallStarsShadow }} />
        {/* Stars layer 2 - Medium stars */}
        <div className="stars-medium" style={{ boxShadow: mediumStarsShadow }} />
        {/* Stars layer 3 - Large stars */}
        <div className="stars-large" style={{ boxShadow: largeStarsShadow }} />
      </div>

      <style jsx>{`
        .stars-small,
        .stars-medium,
        .stars-large {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: transparent;
        }

        /* Small stars */
        .stars-small {
          width: 1px;
          height: 1px;
          opacity: 0.4;
        }

        /* Medium stars */
        .stars-medium {
          width: 2px;
          height: 2px;
          opacity: 0.5;
        }

        /* Large stars */
        .stars-large {
          width: 3px;
          height: 3px;
          opacity: 0.6;
        }

        /* Subtle animation for stars */
        @keyframes twinkle {
          0%, 100% {
            opacity: 0.3;
          }
          50% {
            opacity: 1;
          }
        }

        .stars-small {
          animation: twinkle 3s ease-in-out infinite;
        }

        .stars-medium {
          animation: twinkle 4s ease-in-out infinite 0.5s;
        }

        .stars-large {
          animation: twinkle 5s ease-in-out infinite 1s;
        }

        /* Mobile optimizations */
        @media (max-width: 768px) {
          .stars-large {
            display: none;
          }
        }

        /* Respect user preferences */
        @media (prefers-reduced-motion: reduce) {
          .stars-small,
          .stars-medium,
          .stars-large {
            animation: none;
          }
        }
      `}</style>
    </>
  )
}
