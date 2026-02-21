import Page from '@/app/explore/agents/[slug]/page'

export const dynamic = 'force-static'
export const dynamicParams = true
export const revalidate = 3600

export { generateMetadata } from '@/app/explore/agents/[slug]/page'
export default Page

