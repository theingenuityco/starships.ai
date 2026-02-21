import Page from '@/app/explore/automations/page/[page]/page'

export const dynamic = 'force-static'
export const dynamicParams = true
export const revalidate = 3600

export { generateMetadata } from '@/app/explore/automations/page/[page]/page'
export default Page

