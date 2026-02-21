import { GET as ClientGET } from '@/app/sitemaps/app.xml/route'

export const dynamic = 'force-static'
export const revalidate = 86400

export const GET = ClientGET

