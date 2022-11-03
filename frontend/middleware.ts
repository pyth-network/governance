import { NextResponse } from 'next/server'

export function middleware() {
  // Store the response so we can modify its headers
  const response = NextResponse.next()

  // Block site from being framed with X-Frame-Options and CSP
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('Content-Security-Policy', "frame-ancestors 'none'")

  // Return response
  return response
}
