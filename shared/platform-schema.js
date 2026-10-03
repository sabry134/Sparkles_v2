import { DISCORD_LIMITS, EMPTY_MESSAGE, messageIssues } from './discord-limits.js';

const field = (type, options = {}) => ({ type, ...options });
const text = (options) => field('text', options);
const number = (options) => field('number', options);
const flag = () => field('boolean');
const select = (options, extra = {}) => field('select', { options, ...extra });
const list = (item, options = {}) => field('list', { item, ...options });
const object = fields => field('object', { fields });
const channel = (options) => field('channel', options);
const role = (options) => field('role', options);
const roles = () => field('roles');
const channels = () => field('channels');

export const CAPABILITIES = Object.freeze([
  'view_analytics', 'manage_messages', 'publish_messages', 'manage_rules', 'manage_roles',
  'manage_automod', 'moderate_members', 'manage_tickets', 'view_transcripts', 'manage_commands',
  'manage_workflows', 'manage_integrations', 'manage_community', 'view_audit', 'manage_settings', 'manage_access',
]);
export const TRIGGERS = Object.freeze([
  'member_join', 'member_leave', 'message', 'reaction_add', 'role_add', 'role_remove',
  'voice_join', 'voice_leave', 'ticket_created', 'ticket_closed', 'warning', 'rules_accepted', 'interval',
]);
export const CONDITION_FIELDS = Object.freeze([
  'content', 'username', 'channelId', 'categoryId', 'roleIds', 'accountAgeDays',
  'membershipAgeDays', 'warnings', 'hour', 'weekday', 'isBot', 'isWebhook', 'isAdministrator',
]);
export const CONDITIONS = object({
  field: select(CONDITION_FIELDS, { required: true }),
  operator: select(['equals', 'not_equals', 'contains', 'not_contains', 'starts_with', 'ends_with', 'less_than', 'greater_than', 'regex'], { required: true }),
  value: text({ required: true, multiline: true }),
});
export const ACTION_FIELDS = Object.freeze({
  send_message: { channelId: channel({ required: true }), message: field('message', { required: true }) },
  dm: { message: field('message', { required: true }) },
  add_role: { roleId: role({ required: true }), durationSeconds: number({ min: 0 }) },
  remove_role: { roleId: role({ required: true }) },
  timeout: { durationSeconds: number({ min: 1, max: DISCORD_LIMITS.timeoutSeconds, required: true }), reason: text({ required: true }) },
  warn: { points: number({ min: 1, limit: 'maximumPoints', required: true }), reason: text({ required: true }) },
  kick: { reason: text({ required: true }) },
  ban: { reason: text({ required: true }), durationSeconds: number({ min: 0 }) },
  delete_message: {},
  slowmode: { channelId: channel({ required: true }), durationSeconds: number({ min: 0, max: 21600, required: true }) },
  create_thread: { channelId: channel({ required: true }), name: text({ required: true }) },
  wait: { durationSeconds: number({ min: 1, limit: 'maximumDelaySeconds', required: true }) },
  log: { text: text({ required: true, multiline: true }) },
});
export const COMMON_RESTRICTIONS = {
  requiredRoleIds: roles(), forbiddenRoleIds: roles(),
  minimumAccountAgeDays: number({ min: 0 }), minimumMembershipAgeDays: number({ min: 0 }),
};
export const SCHEDULE_FIELDS = {
  startAt: field('date'), intervalSeconds: number({ min: 0 }), timezone: field('timezone'),
};
export const FEATURES = Object.freeze({
  messages: { capability: 'manage_messages', publish: 'message', fields: { ...SCHEDULE_FIELDS } },
  rules: { capability: 'manage_rules', publish: 'message', fields: {
    layout: select(['raw', 'single_embed', 'multiple_embeds', 'buttons', 'select'], { required: true }),
    rules: list(object({ title: text({ required: true }), description: text({ required: true, multiline: true }), examples: text({ multiline: true }), severity: select(['', 'low', 'medium', 'high']), punishment: text(), emoji: text() }), { required: true, limit: 'maximumRules' }),
    acceptanceEnabled: flag(), acceptanceLabel: text(), acceptanceRoleId: role(), revokeRoleId: role(),
    minimumAccountAgeDays: number({ min: 0 }), minimumMembershipAgeDays: number({ min: 0 }),
    requiredRoleIds: roles(), logChannelId: channel(), ...SCHEDULE_FIELDS,
  } },
  'role-panels': { capability: 'manage_roles', publish: 'message', fields: {
    layout: select(['buttons', 'select'], { required: true }),
    mode: select(['toggle', 'add', 'remove', 'unique', 'multiple'], { required: true }),
    choices: list(object({ label: text({ required: true, max: DISCORD_LIMITS.buttonLabel }), roleId: role({ required: true }), emoji: text(), description: text() }), { required: true, limit: 'maximumRoleChoices' }),
    ...COMMON_RESTRICTIONS, durationSeconds: number({ min: 0 }),
  } },
  'ticket-panels': { capability: 'manage_tickets', publish: 'message', fields: {
    categoryId: field('category', { required: true }), supportRoleIds: field('roles', { required: true }),
    buttonLabel: text({ required: true, max: DISCORD_LIMITS.buttonLabel }), nameFormat: text({ required: true }),
    maximumTickets: number({ min: 1, required: true }), formId: field('resource', { kind: 'forms' }),
    transcriptChannelId: channel(), autoCloseSeconds: number({ min: 0 }), slaSeconds: number({ min: 0 }),
  } },
  forms: { capability: 'manage_community', publish: 'message', fields: {
    buttonLabel: text({ required: true, max: DISCORD_LIMITS.buttonLabel }),
    title: text({ required: true, max: 45 }), destinationChannelId: channel(),
    fields: list(object({ label: text({ required: true, max: 45 }), type: select(['short', 'paragraph'], { required: true }), required: flag(), placeholder: text({ max: DISCORD_LIMITS.optionLabel }) }), { required: true, max: DISCORD_LIMITS.modalFields }),
  } },
  giveaways: { capability: 'manage_community', publish: 'message', fields: {
    prize: text({ required: true }), winnerCount: number({ min: 1, required: true }),
    buttonLabel: text({ required: true, max: DISCORD_LIMITS.buttonLabel }), endAt: field('date', { required: true }),
    startAt: field('date'), ...COMMON_RESTRICTIONS,
  } },
  polls: { capability: 'manage_community', publish: 'message', fields: {
    question: text({ required: true }), choices: list(text({ required: true, max: DISCORD_LIMITS.buttonLabel }), { required: true, min: 2, max: DISCORD_LIMITS.selectOptions }),
    multiple: flag(), anonymous: flag(), endAt: field('date', { required: true }), requiredRoleIds: roles(),
  } },
  workflows: { capability: 'manage_workflows', publish: 'runtime', fields: {
    trigger: select(TRIGGERS, { required: true }), conditions: list(CONDITIONS, { limit: 'maximumConditions' }),
    actions: field('actions', { required: true }), cooldownSeconds: number({ min: 0 }),
    intervalSeconds: number({ min: 0 }),
  } },
  'automod-rules': { capability: 'manage_automod', publish: 'runtime', fields: {
    trigger: select(['contains', 'regex', 'invite', 'links', 'mentions', 'attachments', 'emoji', 'caps', 'length', 'duplicate', 'spam', 'new_account', 'username'], { required: true }),
    pattern: text({ multiline: true }), threshold: number({ min: 0 }), windowSeconds: number({ min: 0 }),
    conditions: list(CONDITIONS, { limit: 'maximumConditions' }), exemptRoleIds: roles(), exemptChannelIds: channels(),
    exemptUserIds: field('users'), exemptBots: flag(), exemptWebhooks: flag(), exemptAdministrators: flag(),
    actions: field('actions', { required: true }), cooldownSeconds: number({ min: 0 }), priority: number({ min: 0 }),
    escalation: list(object({ violations: number({ min: 1, required: true }), windowSeconds: number({ min: 1, required: true }), actions: field('actions', { required: true }) }), { limit: 'maximumSteps' }),
  } },
  commands: { capability: 'manage_commands', publish: 'runtime', fields: {
    trigger: select(['slash', 'exact', 'contains', 'starts_with', 'ends_with', 'regex'], { required: true }),
    pattern: text({ required: true }), description: text({ required: true, max: DISCORD_LIMITS.optionLabel }),
    allowedChannelIds: channels(), deniedChannelIds: channels(), allowedRoleIds: roles(), deniedRoleIds: roles(),
    cooldownSeconds: number({ min: 0 }), conditions: list(CONDITIONS, { limit: 'maximumConditions' }),
    options: list(object({ name: text({ required: true, max: 32 }), description: text({ required: true, max: DISCORD_LIMITS.optionLabel }), type: select(['text', 'integer', 'number', 'boolean', 'user', 'role', 'channel'], { required: true }), required: flag() }), { max: 25 }),
  } },
  feeds: { capability: 'manage_integrations', publish: 'runtime', fields: {
    repository: text({ required: true }), includePrereleases: flag(),
    intervalSeconds: number({ min: 0, required: true }),
  } },
});

export class PlatformError extends Error {
  constructor(code, status = 400, details = []) { super(code); this.code = code; this.status = status; this.details = details; }
}
export function ensure(condition, code = 'INVALID_INPUT', status = 400, details = []) {
  if (!condition) throw new PlatformError(code, status, details);
}
export function plainObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value)); }
export function onlyKeys(value, allowed) {
  ensure(plainObject(value) && Object.keys(value).every(key => allowed.includes(key)));
}
export function id(value, path = 'id') {
  ensure(
    typeof value === 'string' && /^\d{17,20}$/u.test(value),
    'INVALID_INPUT',
    400,
    [
      {
        path,
        code: 'id',
        value:
          value === undefined || value === null || value === ''
            ? '(empty)'
            : String(value).slice(0, 100),
      },
    ],
  );
  return value;
}
export function resourceId(value, path = 'resourceId') {
  ensure(
    typeof value === 'string' && /^[a-f0-9-]{36}$/u.test(value),
    'INVALID_INPUT',
    400,
    [
      {
        path,
        code: 'resource_id',
        value:
          value === undefined || value === null || value === ''
            ? '(empty)'
            : String(value).slice(0, 100),
      },
    ],
  );
  return value;
}
export function revision(value, path = 'revision') {
  ensure(
    Number.isSafeInteger(value) && value > 0,
    'INVALID_INPUT',
    400,
    [{ path, code: 'revision', value }],
  );
  return value;
}
export function validMessage(value, options) {
  const issues = messageIssues(value, options);
  ensure(!issues.length, 'MESSAGE_INVALID', 400, issues);
  return structuredClone(value);
}

function validateField(spec, value, limits, path) {
  const required = spec.required === true;
  const fail = () => { throw new PlatformError('INVALID_INPUT', 400, [{ path, code: 'invalid' }]); };
  if (value === undefined || value === null || value === '') {
    if (required) fail();
    if (spec.type === 'boolean') return false;
    if (['roles', 'channels', 'users', 'list', 'actions'].includes(spec.type)) return [];
    return spec.type === 'number' ? 0 : '';
  }
  switch (spec.type) {
    case 'text':
      if (typeof value !== 'string' || /\u0000/u.test(value) || value.length > (spec.max ?? limits.maximumTextLength) || (required && !value.trim())) fail();
      return value;
    case 'boolean': if (typeof value !== 'boolean') fail(); return value;
    case 'number':
      if (!Number.isSafeInteger(value) || value < (spec.min ?? 0) || value > (spec.max ?? (spec.limit ? limits[spec.limit] : Number.MAX_SAFE_INTEGER))) fail();
      return value;
    case 'select': if (!spec.options.includes(value)) fail(); return value;
    case 'channel': case 'role': case 'category': return id(value, path);
    case 'resource': return resourceId(value, path);
    case 'roles': case 'channels': case 'users':
      if (!Array.isArray(value) || value.length > limits.maximumPageSize || (required && !value.length)) fail();
      return [
        ...new Set(
          value.map((entry, index) => id(entry, `${path}.${index}`)),
        ),
      ];
    case 'date':
      if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail();
      return new Date(value).toISOString();
    case 'timezone':
      if (typeof value !== 'string') fail();
      try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); } catch { fail(); }
      return value;
    case 'message': return validMessage(value);
    case 'object': return validateFields(spec.fields, value, limits, path);
    case 'list':
      if (!Array.isArray(value) || value.length < (spec.min ?? (required ? 1 : 0)) || value.length > (spec.max ?? limits[spec.limit ?? 'maximumSteps'])) fail();
      return value.map((item, index) => validateField(spec.item, item, limits, `${path}.${index}`));
    case 'actions':
      if (!Array.isArray(value) || (required && !value.length) || value.length > limits.maximumSteps) fail();
      return value.map((action, index) => {
        ensure(plainObject(action) && Object.hasOwn(ACTION_FIELDS, action.type));
        onlyKeys(action, ['type', ...Object.keys(ACTION_FIELDS[action.type])]);
        const { type, ...parameters } = action;
        return { type, ...validateFields(ACTION_FIELDS[type], parameters, limits, `${path}.${index}`) };
      });
    default: fail();
  }
}
function validateFields(fields, value, limits, path) {
  onlyKeys(value, Object.keys(fields));
  return Object.fromEntries(Object.entries(fields).map(([key, spec]) => [key, validateField(spec, value[key], limits, `${path}.${key}`)]));
}

export function validateResource(kind, input, limits) {
  ensure(Object.hasOwn(FEATURES, kind), 'NOT_FOUND', 404);
  onlyKeys(input, ['name', 'description', 'channelId', 'message', 'config']);
  const resource = {
    name: validateField(text({ required: true, max: limits.maximumNameLength }), input.name, limits, 'name'),
    description: validateField(text({ max: limits.maximumDescriptionLength }), input.description, limits, 'description'),
    channelId: input.channelId ? id(input.channelId) : '',
    message: validMessage(input.message ?? structuredClone(EMPTY_MESSAGE), { allowEmpty: true }),
    config: validateFields(FEATURES[kind].fields, input.config ?? {}, limits, 'config'),
  };
  const config = resource.config;
  if (config.intervalSeconds) ensure(config.intervalSeconds >= limits.minimumIntervalSeconds);
  if (kind === 'commands') {
    if (config.trigger === 'slash') ensure(/^[a-z0-9_-]{1,32}$/u.test(config.pattern));
    ensure(new Set(config.options.map(option => option.name)).size === config.options.length);
    for (const option of config.options) ensure(/^[a-z0-9_-]{1,32}$/u.test(option.name));
  }
  if (kind === 'feeds') ensure(/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/u.test(config.repository));
  if (kind === 'rules' && config.acceptanceEnabled) ensure(config.acceptanceLabel?.trim() && config.acceptanceRoleId);
  if (kind === 'role-panels') ensure(new Set(config.choices.map(choice => choice.roleId)).size === config.choices.length);
  return resource;
}

export function emptyResource(kind, limits) {
  const initial = spec => {
    if (spec.type === 'boolean') return false;
    if (spec.type === 'number') return spec.min ?? 0;
    if (spec.type === 'select') return spec.options[0];
    if (spec.type === 'timezone') return limits.defaultTimezone;
    if (spec.type === 'message') return structuredClone(EMPTY_MESSAGE);
    if (spec.type === 'object') return Object.fromEntries(Object.entries(spec.fields).map(([key, child]) => [key, initial(child)]));
    if (['list', 'actions', 'roles', 'channels', 'users'].includes(spec.type)) return [];
    return '';
  };
  return { name: '', description: '', channelId: '', message: structuredClone(EMPTY_MESSAGE), config: initial(object(FEATURES[kind].fields)) };
}

export function configurationDiff(before, after, prefix = '') {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (plainObject(before) && plainObject(after)) return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .flatMap(key => configurationDiff(before[key], after[key], prefix ? `${prefix}.${key}` : key));
  return [{ path: prefix, before: before ?? null, after: after ?? null }];
}
