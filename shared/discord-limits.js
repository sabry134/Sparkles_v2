// Discord protocol constraints shared by the browser, API, and gateway worker.
// https://docs.discord.com/developers/resources/message#embed-limits
export const DISCORD_LIMITS = Object.freeze({
  content: 2000, embeds: 10, embedText: 6000, title: 256,
  description: 4096, author: 256, footer: 2048, fields: 25,
  fieldName: 256, fieldValue: 1024, rows: 5, buttons: 5,
  buttonLabel: 80, selectOptions: 25, optionLabel: 100,
  customId: 100, url: 2048, mentions: 100, attachments: 10,
  modalFields: 5, timeoutSeconds: 28 * 24 * 60 * 60,
  bulkDelete: 100, bulkDeleteAgeMs: 14 * 24 * 60 * 60 * 1000,
});

export const EMPTY_MESSAGE = Object.freeze({ content: '', embeds: [], components: [], allowed_mentions: { parse: [], users: [], roles: [], replied_user: false } });
export const MESSAGE_VARIABLES = Object.freeze(['user', 'user.id', 'user.name', 'server', 'server.id', 'channel', 'channel.id', 'member.count', 'date']);

export function safeUrl(value) {
  if (typeof value !== 'string' || value.length > DISCORD_LIMITS.url) return false;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

export function embedTextLength(embed) {
  return [embed.title, embed.description, embed.author?.name, embed.footer?.text,
    ...(embed.fields ?? []).flatMap(field => [field.name, field.value])]
    .reduce((total, value) => total + (typeof value === 'string' ? value.length : 0), 0);
}

export function messageIssues(value, { allowEmpty = false, managedComponents = false } = {}) {
  const issues = [];
  const issue = (path, code, limit) => issues.push({ path, code, ...(limit === undefined ? {} : { limit }) });
  const object = (item) => item && typeof item === 'object' && !Array.isArray(item);
  const keys = (item, allowed, path) => {
    if (!object(item)) { issue(path, 'object'); return false; }
    for (const key of Object.keys(item)) if (!allowed.includes(key)) issue(`${path}.${key}`, 'unsupported');
    return true;
  };
  const text = (item, limit, path, required = false) => {
    if (item === undefined && !required) return;
    if (typeof item !== 'string' || (required && !item.trim()) || /\u0000/u.test(item)) issue(path, 'text');
    else if (item.length > limit) issue(path, 'limit', limit);
  };
  const url = (item, path) => { if (item !== undefined && item !== '' && !safeUrl(item)) issue(path, 'url'); };
  if (!keys(value, ['content', 'embeds', 'components', 'allowed_mentions'], 'message')) return issues;
  text(value.content, DISCORD_LIMITS.content, 'content');
  let total = 0;
  if (!Array.isArray(value.embeds) || value.embeds.length > DISCORD_LIMITS.embeds) issue('embeds', 'limit', DISCORD_LIMITS.embeds);
  else value.embeds.forEach((embed, index) => {
    const path = `embeds.${index}`;
    if (!keys(embed, ['title', 'description', 'url', 'color', 'author', 'footer', 'image', 'thumbnail', 'timestamp', 'fields'], path)) return;
    text(embed.title, DISCORD_LIMITS.title, `${path}.title`);
    text(embed.description, DISCORD_LIMITS.description, `${path}.description`);
    url(embed.url, `${path}.url`);
    if (embed.color !== undefined && (!Number.isInteger(embed.color) || embed.color < 0 || embed.color > 0xffffff)) issue(`${path}.color`, 'color');
    if (embed.timestamp !== undefined && (typeof embed.timestamp !== 'string' || !Number.isFinite(Date.parse(embed.timestamp)))) issue(`${path}.timestamp`, 'date');
    if (embed.author !== undefined && keys(embed.author, ['name', 'url', 'icon_url'], `${path}.author`)) {
      text(embed.author.name, DISCORD_LIMITS.author, `${path}.author.name`, true);
      url(embed.author.url, `${path}.author.url`); url(embed.author.icon_url, `${path}.author.icon_url`);
    }
    if (embed.footer !== undefined && keys(embed.footer, ['text', 'icon_url'], `${path}.footer`)) {
      text(embed.footer.text, DISCORD_LIMITS.footer, `${path}.footer.text`, true);
      url(embed.footer.icon_url, `${path}.footer.icon_url`);
    }
    for (const kind of ['image', 'thumbnail']) if (embed[kind] !== undefined && keys(embed[kind], ['url'], `${path}.${kind}`)) {
      if (!safeUrl(embed[kind].url)) issue(`${path}.${kind}.url`, 'url');
    }
    if (embed.fields !== undefined) {
      if (!Array.isArray(embed.fields) || embed.fields.length > DISCORD_LIMITS.fields) issue(`${path}.fields`, 'limit', DISCORD_LIMITS.fields);
      else embed.fields.forEach((field, current) => {
        const fieldPath = `${path}.fields.${current}`;
        if (!keys(field, ['name', 'value', 'inline'], fieldPath)) return;
        text(field.name, DISCORD_LIMITS.fieldName, `${fieldPath}.name`, true);
        text(field.value, DISCORD_LIMITS.fieldValue, `${fieldPath}.value`, true);
        if (field.inline !== undefined && typeof field.inline !== 'boolean') issue(`${fieldPath}.inline`, 'boolean');
      });
    }
    if (Array.isArray(embed.fields) || embed.fields === undefined) total += embedTextLength(embed);
    if (!allowEmpty && !embed.title && !embed.description && !embed.author?.name && !embed.footer?.text && !embed.image?.url && !embed.thumbnail?.url && !embed.fields?.length) issue(path, 'empty');
  });
  if (total > DISCORD_LIMITS.embedText) issue('embeds', 'limit', DISCORD_LIMITS.embedText);
  if (!Array.isArray(value.components) || value.components.length > DISCORD_LIMITS.rows) issue('components', 'limit', DISCORD_LIMITS.rows);
  else value.components.forEach((row, index) => {
    const path = `components.${index}`;
    if (!keys(row, ['type', 'components'], path)) return;
    if (row.type !== 1 || !Array.isArray(row.components) || !row.components.length || row.components.length > DISCORD_LIMITS.buttons) { issue(path, 'component'); return; }
    row.components.forEach((button, current) => {
      const buttonPath = `${path}.components.${current}`;
      if (!keys(button, ['type', 'style', 'label', 'url', 'emoji', 'disabled', ...(managedComponents ? ['custom_id', 'options', 'min_values', 'max_values', 'placeholder'] : [])], buttonPath)) return;
      if (managedComponents && [2, 3].includes(button.type) && button.custom_id) return;
      if (button.type !== 2 || button.style !== 5) issue(buttonPath, 'linkOnly');
      text(button.label, DISCORD_LIMITS.buttonLabel, `${buttonPath}.label`, true);
      if (!safeUrl(button.url)) issue(`${buttonPath}.url`, 'url');
      if (button.disabled !== undefined && typeof button.disabled !== 'boolean') issue(`${buttonPath}.disabled`, 'boolean');
      if (button.emoji !== undefined && keys(button.emoji, ['name', 'id', 'animated'], `${buttonPath}.emoji`)) {
        text(button.emoji.name, DISCORD_LIMITS.optionLabel, `${buttonPath}.emoji.name`);
        if (button.emoji.id !== undefined && !/^\d{17,20}$/u.test(button.emoji.id)) issue(`${buttonPath}.emoji.id`, 'id');
      }
    });
  });
  if (value.allowed_mentions !== undefined && keys(value.allowed_mentions, ['parse', 'users', 'roles', 'replied_user'], 'allowed_mentions')) {
    const mentions = value.allowed_mentions;
    if (!Array.isArray(mentions.parse) || mentions.parse.some(type => !['everyone'].includes(type))) issue('allowed_mentions.parse', 'mentions');
    for (const kind of ['users', 'roles']) if (mentions[kind] !== undefined && (!Array.isArray(mentions[kind]) || mentions[kind].length > DISCORD_LIMITS.mentions || mentions[kind].some(id => typeof id !== 'string' || !/^\d{17,20}$/u.test(id)))) issue(`allowed_mentions.${kind}`, 'mentions');
    if (mentions.replied_user !== undefined && typeof mentions.replied_user !== 'boolean') issue('allowed_mentions.replied_user', 'boolean');
  }
  if (!allowEmpty && !value.content?.trim() && !value.embeds?.length) issue('content', 'empty');
  return issues;
}

export function renderMessage(message, context = {}) {
  const replace = value => typeof value === 'string'
    ? value.replace(/\{([a-zA-Z0-9_.-]+)\}/gu, (whole, key) => Object.hasOwn(context, key) ? String(context[key]) : whole)
    : value;
  // Variables are expanded only in visible text, never IDs, URLs, or action routes.
  return {
    ...structuredClone(message), content: replace(message.content ?? ''),
    embeds: (message.embeds ?? []).map(embed => ({ ...structuredClone(embed),
      ...(embed.title ? { title: replace(embed.title) } : {}),
      ...(embed.description ? { description: replace(embed.description) } : {}),
      ...(embed.author ? { author: { ...embed.author, name: replace(embed.author.name) } } : {}),
      ...(embed.footer ? { footer: { ...embed.footer, text: replace(embed.footer.text) } } : {}),
      ...(embed.fields ? { fields: embed.fields.map(field => ({ ...field, name: replace(field.name), value: replace(field.value) })) } : {}),
    })), allowed_mentions: structuredClone(message.allowed_mentions ?? EMPTY_MESSAGE.allowed_mentions),
  };
}
