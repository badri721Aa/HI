/**
 * Stand-in for next/link in the standalone build. The standalone site has no
 * arcade page, so links back to it go to the game's own home instead.
 */
import type { AnchorHTMLAttributes, ReactNode } from 'react'

/** The subset of next/link the game uses: a plain anchor (no prefetching or client routing here). */
type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string | { pathname?: string }
  children?: ReactNode
}

export default function Link({ href, children, ...rest }: Props) {
  const raw = typeof href === 'string' ? href : href.pathname ?? '/'
  const target = raw.startsWith('/games') ? '/' : raw
  return (
    <a href={target} {...rest}>
      {children}
    </a>
  )
}
