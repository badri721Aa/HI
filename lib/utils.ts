import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const OWNERS = ['abdulla.mjasim@alhekma.com', 'abdullahmasoud063@gmail.com']

export function isOwner(email: string | undefined | null): boolean {
  if (!email) return false
  return OWNERS.includes(email)
}
