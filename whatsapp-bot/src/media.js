import { downloadMediaMessage, normalizeMessageContent } from 'baileys'

// Finds media in the command message itself or in the message it replies to.
// Returns { type, buffer } or null. `types` e.g. ['imageMessage', 'stickerMessage'].
export async function getMedia(ctx, types) {
  const own = normalizeMessageContent(ctx.msg.message)
  const ownType = types.find((t) => own?.[t])
  let target = null
  if (ownType) {
    target = { msg: ctx.msg, type: ownType }
  } else if (ctx.quoted?.message) {
    const q = normalizeMessageContent(ctx.quoted.message)
    const qType = types.find((t) => q?.[t])
    if (qType) {
      target = {
        type: qType,
        msg: { key: { remoteJid: ctx.chat, id: ctx.quoted.id, participant: ctx.quoted.sender }, message: q },
      }
    }
  }
  if (!target) return null
  const buffer = await downloadMediaMessage(target.msg, 'buffer', {}, { reuploadRequest: ctx.sock.updateMediaMessage })
  return { type: target.type, buffer }
}
