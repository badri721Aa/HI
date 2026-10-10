// All settings come from environment variables (see .env.example).
const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean)

export const config = {
  prefix: process.env.PREFIX || '!',
  // Pairing-code login: your bot number in international format, digits only (e.g. 9665xxxxxxxx).
  // Leave empty to log in by scanning a QR code instead.
  phoneNumber: (process.env.PHONE_NUMBER || '').replace(/\D/g, ''),
  // Group JIDs (…@g.us) the bot answers in. Empty = every group it's in. Use !id to find a group's JID.
  allowedGroups: list(process.env.ALLOWED_GROUPS),
  welcome: process.env.WELCOME !== 'off',
  antiLink: process.env.ANTI_LINK === 'on',
  rules: process.env.GROUP_RULES || '1. Be respectful\n2. No spam\n3. Stay on topic',
  authDir: process.env.AUTH_DIR || 'auth',
}
