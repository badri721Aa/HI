/**
 * Multiplayer constants: backend endpoints, room list, rates and limits.
 *
 * Supabase Realtime (free plan) only carries low-rate traffic — rooms, presence,
 * chat, emotes, ragdoll events, WebRTC signalling and the fallback relay.
 * Movement normally travels peer-to-peer over WebRTC data channels.
 */

/** The site's Supabase project. The publishable key is meant for browser code. */
export const SUPABASE_URL = 'https://gvxnzgogfaifmsdkingq.supabase.co'
export const SUPABASE_KEY = 'sb_publishable_p5ZM1PtUfy5TCBJAo1ksWA_scYxjGyO'

/** Public STUN only (no TURN): peers behind symmetric NATs fall back to the relay. */
export const ICE_SERVERS: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }]

export const MAX_PLAYERS = 8
export const ROOM_CHANNEL_PREFIX = 'starfall:room:'
export const LOBBY_CHANNEL = 'starfall:lobby'
export const PROFILE_KEY = 'starfall:net:profile'

export interface PublicRoomDef {
  code: string
  name: string
}

/** Fixed public rooms, in display order. */
export const PUBLIC_ROOMS: readonly PublicRoomDef[] = [
  { code: 'sunset', name: 'Sunset Beach' },
  { code: 'meadow', name: 'Meadow' },
  { code: 'summit', name: 'Summit' },
  { code: 'cove', name: 'Wreck Cove' },
]

/** Shirt colours offered to players (the hero's own red first). Tuned for golden-hour light. */
export const SHIRT_COLORS: readonly string[] = [
  '#c9432f', // brick red
  '#d9822b', // amber
  '#d8b43c', // mustard
  '#5c9a45', // leaf
  '#2f8c86', // teal
  '#3c6fb8', // harbour blue
  '#7a5ab8', // heather
  '#cc5a82', // rose
]

/** Private room codes: no I, L, O (easily confused with 1 and 0). */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ'
export const CODE_LENGTH = 5

/* ── rates (Hz) ───────────────────────────────────────────── */

/** Peer-to-peer state rate while moving / acting, and while idle. */
export const P2P_RATE_ACTIVE = 20
export const P2P_RATE_IDLE = 2
/** Server relay rate (only for peers without a direct link): while moving, and the idle heartbeat. */
export const RELAY_RATE_ACTIVE = 4
export const RELAY_RATE_IDLE = 0.5
/** Seconds a fresh link may take to open before the relay covers that peer. */
export const DIRECT_GRACE = 6
/** A link not open after this many seconds is torn down and retried (impolite side). */
export const LINK_TIMEOUT = 16
/** Retry delays (s) after a failed link; after the last one the peer stays on the relay. */
export const LINK_RETRY = [4, 12, 30] as const
export const PING_INTERVAL = 2

/* ── smoothing ────────────────────────────────────────────── */

/** Snapshot interpolation delay for direct links (s). */
export const INTERP_DELAY = 0.1
/** Max velocity extrapolation past the newest snapshot (s): direct, relay. */
export const EXTRAPOLATE_DIRECT = 0.25
export const EXTRAPOLATE_RELAY = 0.6
/** Jumps larger than this (m) snap instead of sliding. */
export const TELEPORT_DIST = 8

/* ── limits ───────────────────────────────────────────────── */

export const NAME_MAX = 16
export const CHAT_MAX = 140
/** Client-side chat limit: burst of 3, then 1 message per second. */
export const CHAT_BURST = 3
export const CHAT_REFILL = 1
/** Name tags fade out between these distances (m). */
export const TAG_FADE_START = 38
export const TAG_HIDE = 60
/** Seconds a chat bubble stays above a player's head. */
export const BUBBLE_TIME = 7
