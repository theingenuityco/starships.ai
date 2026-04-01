'use client'

import type { ComparisonContent } from '@/app/compare/comparison-content'
import TestimonialsSection from '@/app/components/TestimonialsSection'
import Security from '@/app/components/Security'

export default function ComparisonProofStrip(props: { content: ComparisonContent }) {
  const { content: _content } = props

  return (
    <>
      <TestimonialsSection />
      <Security />
    </>
  )
}
