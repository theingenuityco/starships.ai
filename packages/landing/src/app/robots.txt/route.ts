import { GET as ClientGET } from '@/app/robots.txt/route'

export const dynamic = 'force-static'
export const revalidate = 86400

export const GET = ClientGET

