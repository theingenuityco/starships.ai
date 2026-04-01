'use client'

import FAQ from '@/app/components/FAQ'
import type { ComparisonContent } from '@/app/compare/comparison-content'

export default function ComparisonFaq(props: { content: ComparisonContent }) {
  const { content } = props
  return <FAQ items={content.faqItems} title={content.faqTitle} sectionTone="white" />
}
