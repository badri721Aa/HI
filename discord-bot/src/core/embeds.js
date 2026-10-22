'use strict';
const { EmbedBuilder } = require('discord.js');
const config = require('../config');

const colors = {
  primary: config.embedColor,
  success: 0x57f287,
  error: 0xed4245,
  warn: 0xfee75c,
  info: 0x5865f2,
  gold: 0xf1c40f,
  pink: 0xeb459e,
  dark: 0x2b2d31,
};

/**
 * embed({ title, description, color, fields, footer, image, thumbnail, url, author, timestamp })
 * Plain object in, EmbedBuilder out. Fields with empty values are dropped so callers can be sloppy.
 */
function embed(opts = {}) {
  const e = new EmbedBuilder().setColor(opts.color ?? colors.primary);
  if (opts.title) e.setTitle(String(opts.title).slice(0, 256));
  if (opts.description) e.setDescription(String(opts.description).slice(0, 4096));
  if (opts.url) e.setURL(opts.url);
  if (opts.image) e.setImage(opts.image);
  if (opts.thumbnail) e.setThumbnail(opts.thumbnail);
  if (opts.author) e.setAuthor(typeof opts.author === 'string' ? { name: opts.author } : opts.author);
  if (opts.footer) e.setFooter(typeof opts.footer === 'string' ? { text: opts.footer } : opts.footer);
  if (opts.timestamp) e.setTimestamp(opts.timestamp === true ? new Date() : opts.timestamp);
  if (opts.fields?.length) {
    e.addFields(
      opts.fields
        .filter((f) => f && f.value !== undefined && f.value !== null && String(f.value).length)
        .slice(0, 25)
        .map((f) => ({ name: String(f.name).slice(0, 256), value: String(f.value).slice(0, 1024), inline: !!f.inline })),
    );
  }
  return e;
}

const success = (description, title) => embed({ color: colors.success, description: `✅ ${description}`, title });
const error = (description, title) => embed({ color: colors.error, description: `❌ ${description}`, title });
const warn = (description, title) => embed({ color: colors.warn, description: `⚠️ ${description}`, title });
const info = (description, title) => embed({ color: colors.info, description, title });

module.exports = { embed, success, error, warn, info, colors };
