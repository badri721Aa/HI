// Deliberately short — this is a good-faith filter for obvious cases, not
// an exhaustive moderation system. Anything more serious belongs server-side
// (Supabase Auth hooks) where it can't be bypassed by calling the API directly.
const BLOCKED_SUBSTRINGS = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "cunt",
  "nigger",
  "nigga",
  "faggot",
  "retard",
  "rape",
]

export function validateUsername(raw: string): string | null {
  const value = raw.trim()

  if (value.length < 3) return "Username needs to be at least 3 characters."
  if (value.length > 24) return "Username needs to be 24 characters or fewer."
  if (/\s/.test(value)) return "Username can't contain spaces."
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    return "Username can only use letters, numbers, underscores, and hyphens."
  }

  const lower = value.toLowerCase()
  if (BLOCKED_SUBSTRINGS.some((word) => lower.includes(word))) {
    return "That username isn't allowed."
  }

  return null
}
