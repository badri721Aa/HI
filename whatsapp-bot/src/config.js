// All settings come from environment variables (see .env.example).
const list = (v) => (v || '').split(',').map((s) => s.trim()).filter(Boolean)
const digits = (v) => (v || '').replace(/\D/g, '')

export const config = {
  prefix: process.env.PREFIX || '!',
  // Who can use commands when the bot runs on YOUR OWN number:
  //   public — everyone in your groups (default)
  //   self   — only you (commands you type yourself)
  mode: process.env.BOT_MODE === 'self' ? 'self' : 'public',
  // Pairing-code login: the WhatsApp number to link, digits only with country code (e.g. 9665xxxxxxxx).
  // Leave empty to log in by scanning a QR code instead.
  phoneNumber: digits(process.env.PHONE_NUMBER),
  // Extra people allowed to use owner commands (digits only). The linked account is always an owner.
  owners: list(process.env.OWNER_NUMBERS).map(digits),
  // Group JIDs (…@g.us) the bot answers in. Empty = every group. Use !id to find a group's JID.
  allowedGroups: list(process.env.ALLOWED_GROUPS),
  // Answer commands in private chats too (owner commands always work in private).
  allowDms: process.env.ALLOW_DMS === 'on',
  botName: process.env.BOT_NAME || 'BOT',
  // Start every bot message with a "🤖 BOT" header, so people can tell bot replies from your own
  // messages when it runs on your personal number.
  label: process.env.BOT_LABEL !== 'off',
  // Defaults for new groups; admins can change them per group with commands.
  welcome: process.env.WELCOME !== 'off',
  antiLink: process.env.ANTI_LINK === 'on',
  rules: (process.env.GROUP_RULES || '1. Be respectful\n2. No spam\n3. Stay on topic').replace(/\\n/g, '\n'),
  authDir: process.env.AUTH_DIR || 'auth',
  dataFile: process.env.DATA_FILE || 'data/db.json',
}
