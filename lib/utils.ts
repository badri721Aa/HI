import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const ROOT_OWNER = 'abdulla.mjasim@alhekma.com' as const

export function isOwner(email: string | undefined | null): boolean {
  if (!email) return false
  return email.toLowerCase() === ROOT_OWNER
}

export function isRootOwner(email: string | undefined | null): boolean {
  return isOwner(email)
}

export type UserRole = 'user' | 'admin' | 'owner'

export function roleLevel(role: UserRole | string): number {
  return { user: 0, admin: 1, owner: 2 }[role as UserRole] ?? 0
}

export function canAdmin(role: UserRole | string): boolean {
  return roleLevel(role) >= 1
}

export function relativeTime(ts: string): string {
  const delta = Date.now() - new Date(ts).getTime()
  const s = Math.floor(delta / 1000)
  if (s < 60)  return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60)  return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24)  return `${h}h ago`
  return new Date(ts).toLocaleDateString()
}

export function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}
