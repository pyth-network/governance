import { ReactNode } from 'react'

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-xl text-center leading-6">{children}</div>
  )
}
