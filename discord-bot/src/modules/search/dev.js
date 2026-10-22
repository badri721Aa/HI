'use strict';
const dns = require('node:dns').promises;
const { discordTimestamp, formatNumber, truncate } = require('../../core/utils');
const { button, row } = require('../../core/ui');
const { getJson, getText, userError, enc } = require('./_http');

const GH = { headers: { Accept: 'application/vnd.github+json' } };
const DOMAIN_RE = /^(?=.{1,253}$)(?!-)([a-z0-9-]{1,63}\.)+[a-z]{2,63}$/i;

const cleanDomain = (s) => String(s || '').trim().replace(/^https?:\/\//i, '').replace(/[/?#].*$/, '').toLowerCase();

module.exports = [
  {
    name: 'github',
    aliases: ['gh', 'ghuser'],
    description: 'Look up a GitHub user or organisation',
    usage: '<username>',
    examples: ['torvalds'],
    minArgs: 1,
    cooldown: 4,
    async execute(ctx) {
      const name = ctx.args[0].replace(/^@/, '');
      if (name.includes('/')) return ctx.fail(`That looks like a repository — use \`${ctx.prefix}githubrepo ${name}\`.`);
      if (!/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(name)) return ctx.fail('That is not a valid GitHub username.');
      await ctx.defer();
      const u = await getJson(`https://api.github.com/users/${enc(name)}`, { ...GH, notFound: `GitHub user **${name}** not found.` });
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `🐙 ${u.name ? `${u.name} (${u.login})` : u.login}`,
            url: u.html_url,
            description: u.bio ? truncate(u.bio, 500) : null,
            thumbnail: u.avatar_url,
            fields: [
              { name: 'Type', value: u.type, inline: true },
              { name: 'Public repos', value: formatNumber(u.public_repos), inline: true },
              { name: 'Followers', value: formatNumber(u.followers), inline: true },
              { name: 'Following', value: formatNumber(u.following), inline: true },
              { name: 'Location', value: u.location || null, inline: true },
              { name: 'Company', value: u.company || null, inline: true },
              { name: 'Website', value: u.blog || null, inline: true },
              { name: 'Joined', value: discordTimestamp(u.created_at, 'D'), inline: true },
            ],
          }),
        ],
      });
    },
  },
  {
    name: 'githubrepo',
    aliases: ['repo', 'ghrepo'],
    description: 'Look up a GitHub repository (owner/name)',
    usage: '<owner/repo>',
    examples: ['nodejs/node', 'discordjs/discord.js'],
    minArgs: 1,
    cooldown: 4,
    async execute(ctx) {
      const m = ctx.args[0].replace(/^https?:\/\/github\.com\//i, '').match(/^([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/);
      if (!m) return ctx.usage('Use `owner/repo`, e.g. `nodejs/node`.');
      await ctx.defer();
      const r = await getJson(`https://api.github.com/repos/${enc(m[1])}/${enc(m[2])}`, { ...GH, notFound: `Repository **${m[1]}/${m[2]}** not found (or private).` });
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `📦 ${r.full_name}${r.archived ? ' (archived)' : ''}`,
            url: r.html_url,
            description: r.description ? truncate(r.description, 500) : null,
            thumbnail: r.owner?.avatar_url,
            fields: [
              { name: '⭐ Stars', value: formatNumber(r.stargazers_count), inline: true },
              { name: '🍴 Forks', value: formatNumber(r.forks_count), inline: true },
              { name: '🐛 Open issues', value: formatNumber(r.open_issues_count), inline: true },
              { name: 'Language', value: r.language || 'Unknown', inline: true },
              { name: 'License', value: r.license?.spdx_id || r.license?.name || 'None', inline: true },
              { name: 'Default branch', value: r.default_branch, inline: true },
              { name: 'Created', value: discordTimestamp(r.created_at, 'D'), inline: true },
              { name: 'Last push', value: discordTimestamp(r.pushed_at, 'R'), inline: true },
              { name: 'Topics', value: r.topics?.length ? r.topics.slice(0, 10).map((t) => `\`${t}\``).join(' ') : null },
            ],
          }),
        ],
      });
    },
  },
  {
    name: 'npm',
    aliases: ['npmjs', 'npmpackage'],
    description: 'Look up an npm package',
    usage: '<package>',
    examples: ['discord.js', '@discordjs/voice'],
    minArgs: 1,
    cooldown: 3,
    async execute(ctx) {
      const name = ctx.args[0].toLowerCase();
      if (!/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name)) return ctx.fail('That is not a valid npm package name.');
      await ctx.defer();
      const path = name.startsWith('@') ? `@${enc(name.slice(1))}` : enc(name);
      const pkg = await getJson(`https://registry.npmjs.org/${path}/latest`, { notFound: `npm package **${name}** not found.` });
      const dl = await getJson(`https://api.npmjs.org/downloads/point/last-week/${path}`).catch(() => null);
      const repo = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `📦 ${pkg.name}@${pkg.version}`,
            url: `https://www.npmjs.com/package/${pkg.name}`,
            description: pkg.description ? truncate(pkg.description, 500) : null,
            fields: [
              { name: 'Weekly downloads', value: dl?.downloads != null ? formatNumber(dl.downloads) : 'Unknown', inline: true },
              { name: 'License', value: typeof pkg.license === 'string' ? pkg.license : pkg.license?.type || 'None', inline: true },
              { name: 'Dependencies', value: String(Object.keys(pkg.dependencies || {}).length), inline: true },
              { name: 'Author', value: typeof pkg.author === 'string' ? pkg.author : pkg.author?.name || null, inline: true },
              { name: 'Maintainers', value: pkg.maintainers?.length ? truncate(pkg.maintainers.map((m) => m.name).join(', '), 200) : null, inline: true },
              { name: 'Homepage', value: pkg.homepage || null, inline: false },
              { name: 'Repository', value: repo ? repo.replace(/^git\+/, '').replace(/\.git$/, '') : null, inline: false },
              { name: 'Keywords', value: pkg.keywords?.length ? truncate(pkg.keywords.slice(0, 12).join(', '), 300) : null },
            ],
            footer: `npm install ${pkg.name}`,
          }),
        ],
      });
    },
  },
  {
    name: 'pypi',
    aliases: ['pip', 'pythonpackage'],
    description: 'Look up a Python package on PyPI',
    usage: '<package>',
    examples: ['requests'],
    minArgs: 1,
    cooldown: 3,
    async execute(ctx) {
      const name = ctx.args[0];
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) return ctx.fail('That is not a valid PyPI package name.');
      await ctx.defer();
      const { info } = await getJson(`https://pypi.org/pypi/${enc(name)}/json`, { notFound: `PyPI package **${name}** not found.` });
      const home = info.project_urls?.Homepage || info.project_urls?.Source || info.home_page;
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `🐍 ${info.name} ${info.version}`,
            url: info.package_url || `https://pypi.org/project/${info.name}/`,
            description: info.summary ? truncate(info.summary, 500) : null,
            fields: [
              { name: 'Author', value: info.author || info.author_email?.split('<')[0]?.trim() || null, inline: true },
              { name: 'License', value: info.license ? truncate(info.license, 60) : null, inline: true },
              { name: 'Python', value: info.requires_python || null, inline: true },
              { name: 'Homepage', value: home || null, inline: false },
            ],
            footer: `pip install ${info.name}`,
          }),
        ],
      });
    },
  },
  {
    name: 'crates',
    aliases: ['crate', 'cargo'],
    description: 'Look up a Rust crate on crates.io',
    usage: '<crate>',
    examples: ['serde'],
    minArgs: 1,
    cooldown: 3,
    async execute(ctx) {
      const name = ctx.args[0];
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) return ctx.fail('That is not a valid crate name.');
      await ctx.defer();
      const { crate: c } = await getJson(`https://crates.io/api/v1/crates/${enc(name)}`, { notFound: `Crate **${name}** not found.` });
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `🦀 ${c.name} ${c.max_stable_version || c.max_version || c.newest_version || ''}`,
            url: `https://crates.io/crates/${c.name}`,
            description: c.description ? truncate(c.description, 500) : null,
            fields: [
              { name: 'Downloads', value: formatNumber(c.downloads || 0), inline: true },
              { name: 'Recent (90d)', value: c.recent_downloads != null ? formatNumber(c.recent_downloads) : null, inline: true },
              { name: 'Updated', value: c.updated_at ? discordTimestamp(c.updated_at, 'R') : null, inline: true },
              { name: 'Docs', value: c.documentation || `https://docs.rs/${c.name}`, inline: false },
              { name: 'Repository', value: c.repository || null, inline: false },
            ],
            footer: `cargo add ${c.name}`,
          }),
        ],
      });
    },
  },
  {
    name: 'domain',
    aliases: ['rdap', 'domaininfo'],
    description: 'Domain registration info (registrar, dates, nameservers) via RDAP',
    usage: '<domain>',
    examples: ['example.com'],
    minArgs: 1,
    cooldown: 4,
    async execute(ctx) {
      const domain = cleanDomain(ctx.args[0]);
      if (!DOMAIN_RE.test(domain)) return ctx.fail('That is not a valid domain name.');
      await ctx.defer();
      const d = await getJson(`https://rdap.org/domain/${enc(domain)}`, { notFound: `No registration data for **${domain}** (unregistered, or its registry has no RDAP).`, timeout: 15000 });
      const event = (action) => d.events?.find((e) => e.eventAction === action)?.eventDate;
      const registrar = d.entities?.find((e) => e.roles?.includes('registrar'));
      const registrarName = registrar?.vcardArray?.[1]?.find((v) => v[0] === 'fn')?.[3] || registrar?.handle;
      const ns = (d.nameservers || []).map((n) => n.ldhName?.toLowerCase()).filter(Boolean);
      const dateField = (label, iso) => ({ name: label, value: iso ? `${discordTimestamp(iso, 'D')} (${discordTimestamp(iso, 'R')})` : null, inline: false });
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `🌐 ${d.ldhName?.toLowerCase() || domain}`,
            fields: [
              { name: 'Registrar', value: registrarName || null, inline: true },
              { name: 'Status', value: d.status?.length ? truncate(d.status.join(', '), 300) : null, inline: true },
              dateField('Registered', event('registration')),
              dateField('Expires', event('expiration')),
              dateField('Last changed', event('last changed')),
              { name: 'Nameservers', value: ns.length ? ns.slice(0, 8).join('\n') : null },
            ],
            footer: 'Data: RDAP (rdap.org)',
          }),
        ],
      });
    },
  },
  {
    name: 'dnslookup',
    aliases: ['dns', 'nslookup'],
    description: 'DNS records for a domain (A, AAAA, MX, TXT, NS, CNAME)',
    usage: '<domain> [type]',
    examples: ['example.com', 'example.com MX'],
    minArgs: 1,
    cooldown: 3,
    async execute(ctx) {
      const domain = cleanDomain(ctx.args[0]);
      if (!DOMAIN_RE.test(domain)) return ctx.fail('That is not a valid domain name.');
      const types = ctx.args[1] ? [ctx.args[1].toUpperCase()] : ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME'];
      if (!types.every((t) => ['A', 'AAAA', 'MX', 'NS', 'TXT', 'CNAME', 'SOA', 'CAA', 'SRV'].includes(t))) return ctx.fail('Supported types: A, AAAA, MX, NS, TXT, CNAME, SOA, CAA, SRV.');
      await ctx.defer();
      const fmt = (type, recs) => {
        if (type === 'MX') return recs.sort((a, b) => a.priority - b.priority).map((r) => `${r.priority} ${r.exchange}`);
        if (type === 'TXT') return recs.map((r) => r.join(''));
        if (type === 'SOA') return [`${recs.nsname} ${recs.hostmaster} serial ${recs.serial}`];
        if (type === 'CAA') {
          return recs.map((r) => {
            const tag = Object.keys(r).find((k) => k !== 'critical');
            return `${r.critical} ${tag} "${r[tag]}"`;
          });
        }
        if (type === 'SRV') return recs.map((r) => `${r.priority} ${r.weight} ${r.port} ${r.name}`);
        return recs.map(String);
      };
      const results = await Promise.all(types.map((t) => dns.resolve(domain, t).then((r) => [t, fmt(t, r)]).catch((err) => [t, err])));
      const netErr = results.find(([, r]) => r instanceof Error && ['ECONNREFUSED', 'ETIMEOUT', 'EAI_AGAIN', 'ESERVFAIL'].includes(r.code));
      const found = results.filter(([, r]) => Array.isArray(r) && r.length);
      if (!found.length) {
        if (netErr) throw netErr[1];
        throw userError(`No ${types.join('/')} records found for **${domain}**.`);
      }
      await ctx.reply({
        embeds: [
          ctx.embed({
            title: `🧭 DNS for ${domain}`,
            fields: found.map(([t, r]) => ({ name: t, value: `\`\`\`\n${truncate(r.slice(0, 15).join('\n'), 1000)}\n\`\`\`` })),
          }),
        ],
      });
    },
  },
  {
    name: 'shorten',
    aliases: ['shorturl', 'tinyurl'],
    description: 'Shorten a long URL with is.gd',
    usage: '<url>',
    examples: ['https://en.wikipedia.org/wiki/Discord'],
    minArgs: 1,
    cooldown: 5,
    async execute(ctx) {
      const url = ctx.args[0];
      if (!/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(url) || url.length > 2000) return ctx.fail('Give a full link starting with http:// or https://');
      await ctx.defer();
      const short = (await getText(`https://is.gd/create.php?format=simple&url=${enc(url)}`, { notFound: 'is.gd rejected that link.' })).trim();
      if (!/^https?:\/\//.test(short)) throw userError(`is.gd could not shorten that: ${truncate(short, 200)}`);
      await ctx.reply({ embeds: [ctx.embed({ title: '🔗 Shortened', description: `${short}\n\n→ ${truncate(url, 300)}` })], components: [row(button(short, 'Open', 'Link'))] });
    },
  },
  {
    name: 'qr',
    aliases: ['qrcode', 'makeqr'],
    description: 'Turn text or a link into a QR code',
    usage: '<text or url>',
    examples: ['https://discord.com', 'Hello world'],
    minArgs: 1,
    async execute(ctx) {
      const text = ctx.rest(0);
      if (text.length > 900) return ctx.fail('That is too long for a QR code (max 900 characters).');
      const url = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&margin=10&data=${enc(text)}`;
      await ctx.reply({ embeds: [ctx.embed({ title: '🔳 QR code', description: `\`${truncate(text, 200)}\``, image: url })], components: [row(button(url, 'Download', 'Link'))] });
    },
  },
];
