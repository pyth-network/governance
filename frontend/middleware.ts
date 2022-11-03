import { NextResponse } from 'next/server'

export function middleware() {
  // Store the response so we can modify its headers
  const response = NextResponse.next()

  // set x-frame options to deny
  response.headers.set('x-frame-options', 'deny')

  // Return response
  return response
}
