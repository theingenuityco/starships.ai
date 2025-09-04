import { NextResponse } from 'next/server'

export async function POST() {
  const res = NextResponse.json({
    success: true,
    message: 'Session cleared',
  })

  res.cookies.delete('waitlist_validated')

  return res
}
