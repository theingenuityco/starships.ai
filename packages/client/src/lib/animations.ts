// Framer Motion animation variants for chat components
import { Variants } from 'motion/react'

// Message Animation Variants
export const messageVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
    scale: 0.95,
    filter: 'blur(4px)',
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    filter: 'blur(0px)',
    transition: {
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  },
  exit: {
    opacity: 0,
    y: -20,
    scale: 0.95,
    filter: 'blur(4px)',
    transition: {
      duration: 0.2,
    },
  },
}

// Streaming Animation Variants
export const streamingVariants: Variants = {
  typing: {
    opacity: [0.5, 1, 0.5],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
  complete: {
    opacity: 1,
    transition: {
      duration: 0.3,
    },
  },
}

// Provider Switch Animation Variants
export const providerSwitchVariants: Variants = {
  inactive: {
    scale: 1,
    opacity: 0.7,
    backgroundColor: 'hsl(var(--muted))',
    borderColor: 'hsl(var(--border))',
  },
  active: {
    scale: 1.05,
    opacity: 1,
    backgroundColor: 'hsl(var(--primary))',
    borderColor: 'hsl(var(--primary))',
    boxShadow: '0 0 20px hsl(var(--primary) / 0.3)',
    transition: {
      duration: 0.2,
      ease: 'easeOut',
    },
  },
  hover: {
    scale: 1.02,
    transition: {
      duration: 0.15,
    },
  },
}

// Header Animation Variants
export const headerVariants: Variants = {
  hidden: { opacity: 0, y: -20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  },
}

// Input Animation Variants
export const inputVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      delay: 0.2,
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  },
}

// Streaming Indicator Variants
export const streamingIndicatorVariants: Variants = {
  hidden: { opacity: 0, scale: 0.8, x: 20 },
  visible: {
    opacity: 1,
    scale: 1,
    x: 0,
    transition: {
      duration: 0.3,
      ease: 'easeOut',
    },
  },
  exit: {
    opacity: 0,
    scale: 0.8,
    x: 20,
    transition: {
      duration: 0.2,
    },
  },
}

// Content Block Animation Variants
export const contentBlockVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 10,
    scale: 0.98,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.3,
      ease: 'easeOut',
    },
  },
}

// Code Block Animation Variants
export const codeBlockVariants: Variants = {
  hidden: {
    opacity: 0,
    y: 15,
    rotateX: -5,
  },
  visible: {
    opacity: 1,
    y: 0,
    rotateX: 0,
    transition: {
      duration: 0.4,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  },
}

// Table Animation Variants
export const tableVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.95,
    y: 10,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: 'easeOut',
    },
  },
}

// Avatar Animation Variants
export const avatarVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.8,
    rotate: -10,
  },
  visible: {
    opacity: 1,
    scale: 1,
    rotate: 0,
    transition: {
      duration: 0.3,
      ease: 'easeOut',
    },
  },
  hover: {
    scale: 1.1,
    rotate: 5,
    transition: {
      duration: 0.2,
    },
  },
}

// Loading Skeleton Variants
export const skeletonVariants: Variants = {
  loading: {
    opacity: [0.5, 1, 0.5],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
}

// Page Transition Variants
export const pageVariants: Variants = {
  initial: {
    opacity: 0,
    y: 20,
    scale: 0.98,
  },
  in: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.5,
      ease: [0.25, 0.46, 0.45, 0.94],
    },
  },
  out: {
    opacity: 0,
    y: -20,
    scale: 0.98,
    transition: {
      duration: 0.3,
    },
  },
}

// Stagger Animation for Lists
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
}

export const staggerItem: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.3,
      ease: 'easeOut',
    },
  },
}

// Button Animation Variants
export const buttonVariants: Variants = {
  idle: {
    scale: 1,
    boxShadow: '0 0 0 rgba(99, 102, 241, 0)',
  },
  hover: {
    scale: 1.02,
    boxShadow: '0 0 20px rgba(99, 102, 241, 0.3)',
    transition: {
      duration: 0.2,
    },
  },
  tap: {
    scale: 0.98,
    transition: {
      duration: 0.1,
    },
  },
}

// Modal/Dialog Animation Variants
export const modalVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.95,
    y: 20,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: 'easeOut',
    },
  },
  exit: {
    opacity: 0,
    scale: 0.95,
    y: 20,
    transition: {
      duration: 0.2,
    },
  },
}

// Backdrop Animation Variants
export const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.2,
    },
  },
  exit: {
    opacity: 0,
    transition: {
      duration: 0.2,
    },
  },
}

// Utility Functions
export const getReducedMotionVariants = (variants: Variants): Variants => {
  const reducedVariants: Variants = {}

  Object.keys(variants).forEach(key => {
    const variant = variants[key]
    if (typeof variant === 'object' && variant !== null) {
      reducedVariants[key] = {
        ...variant,
        transition: {
          duration: 0.01,
          ease: 'linear',
        },
      }
    } else {
      reducedVariants[key] = variant
    }
  })

  return reducedVariants
}

// Spring Configurations
export const springConfigs = {
  gentle: {
    type: 'spring',
    stiffness: 120,
    damping: 14,
  },
  wobbly: {
    type: 'spring',
    stiffness: 180,
    damping: 12,
  },
  stiff: {
    type: 'spring',
    stiffness: 210,
    damping: 20,
  },
  slow: {
    type: 'spring',
    stiffness: 60,
    damping: 15,
  },
} as const

// Easing Functions
export const easings = {
  easeInOut: [0.4, 0, 0.2, 1],
  easeOut: [0, 0, 0.2, 1],
  easeIn: [0.4, 0, 1, 1],
  sharp: [0.4, 0, 0.6, 1],
  smooth: [0.25, 0.46, 0.45, 0.94],
} as const
