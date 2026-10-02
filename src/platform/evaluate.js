import { Worker } from 'node:worker_threads';
import { platformConfig as limits } from './config.js';
import { ensure, PlatformError } from '../../shared/platform-schema.js';
let running = 0;
const queued = [];
async function acquireRegexSlot() {
  if (running >= limits.regexMaximumConcurrent) {
    ensure(queued.length < limits.regexMaximumQueued, 'REGEX_BUSY', 429);
    await new Promise(resolve => queued.push(resolve));
  } else running += 1;
}
function releaseRegexSlot() { const next = queued.shift(); if (next) next(); else running -= 1; }

export async function safeRegex(pattern, content) {
  ensure(typeof pattern === 'string' && pattern.length > 0 && pattern.length <= limits.regexMaximumLength, 'REGEX_INVALID');
  try { new RegExp(pattern, 'iu'); } catch { throw new PlatformError('REGEX_INVALID'); }
  // Untrusted expressions never execute on the gateway/API event loop.
  await acquireRegexSlot();
  try {
    return await new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./regex-worker.js', import.meta.url), { workerData: { pattern, content: String(content).slice(0, limits.maximumTextLength) }, resourceLimits: { maxOldGenerationSizeMb: limits.regexMemoryMb } });
      let timer; let settled = false;
      const finish = (error, result) => { if (settled) return; settled = true; clearTimeout(timer); worker.terminate().catch(() => {}); error ? reject(error) : resolve(result); };
      timer = setTimeout(() => finish(new PlatformError('REGEX_TIMEOUT')), limits.regexStartupTimeoutMs);
      worker.once('online', () => { clearTimeout(timer); timer = setTimeout(() => finish(new PlatformError('REGEX_TIMEOUT')), limits.regexTimeoutMs); });
      worker.once('message', result => finish(null, result));
      worker.once('error', () => finish(new PlatformError('REGEX_INVALID')));
      worker.once('exit', () => { if (!settled) finish(new PlatformError('REGEX_INVALID')); });
    });
  } finally { releaseRegexSlot(); }
}

export async function checkCondition(condition, context) {
  const actual = context[condition.field];
  const expected = condition.value;
  if (actual === undefined || actual === null) return false;
  const normal = value => String(value).toLocaleLowerCase();
  const left = normal(actual); const right = normal(expected);
  switch (condition.operator) {
    case 'equals': return Array.isArray(actual) ? actual.includes(expected) : left === right;
    case 'not_equals': return Array.isArray(actual) ? !actual.includes(expected) : left !== right;
    case 'contains': return Array.isArray(actual) ? actual.includes(expected) : left.includes(right);
    case 'not_contains': return Array.isArray(actual) ? !actual.includes(expected) : !left.includes(right);
    case 'starts_with': return left.startsWith(right);
    case 'ends_with': return left.endsWith(right);
    case 'less_than': return Number.isFinite(Number(expected)) && Number(actual) < Number(expected);
    case 'greater_than': return Number.isFinite(Number(expected)) && Number(actual) > Number(expected);
    case 'regex': return safeRegex(expected, actual);
    default: return false;
  }
}

export async function evaluate(resource, context) {
  const config = (resource.draft ?? resource.snapshot).config;
  const trace = [];
  const check = (code, passed, details = {}) => { trace.push({ code, passed, ...details }); return passed; };
  let passed = true;
  for (const [key, actual] of [['exemptRoleIds', context.roleIds ?? []], ['exemptChannelIds', [context.channelId]], ['exemptUserIds', [context.userId]]]) {
    const matched = (config[key] ?? []).find(value => actual.includes(value));
    if (matched) passed = check('exemption', false, { field: key, value: matched });
  }
  for (const [key, actual] of [['exemptBots', context.isBot], ['exemptWebhooks', context.isWebhook], ['exemptAdministrators', context.isAdministrator]]) {
    if (config[key] && actual) passed = check('exemption', false, { field: key });
  }
  for (const condition of config.conditions ?? []) {
    const result = await checkCondition(condition, context);
    check('condition', result, { field: condition.field, operator: condition.operator, expected: condition.value, actual: context[condition.field] ?? null });
    passed = passed && result;
  }
  const content = String(context.content ?? '');
  const normalized = content.toLocaleLowerCase();
  let triggered = false;
  if (resource.kind === 'workflows') triggered = config.trigger === context.event;
  if (resource.kind === 'commands') {
    triggered = config.trigger === 'slash' ? context.commandName === config.pattern : await checkCondition({ field: 'content', operator: config.trigger === 'exact' ? 'equals' : config.trigger, value: config.pattern }, context);
    for (const [key, actual] of [['allowedChannelIds', [context.channelId]], ['allowedRoleIds', context.roleIds ?? []]]) if (config[key]?.length && !config[key].some(value => actual.includes(value))) passed = check('restriction', false, { field: key });
    for (const [key, actual] of [['deniedChannelIds', [context.channelId]], ['deniedRoleIds', context.roleIds ?? []]]) if (config[key]?.some(value => actual.includes(value))) passed = check('restriction', false, { field: key });
  }
  if (resource.kind === 'automod-rules') {
    const threshold = config.threshold;
    switch (config.trigger) {
      case 'contains': triggered = !!config.pattern && config.pattern.split('\n').filter(Boolean).some(term => normalized.includes(term.toLocaleLowerCase())); break;
      case 'regex': triggered = await safeRegex(config.pattern, content); break;
      case 'invite': triggered = /(?:discord\.gg|discord(?:app)?\.com\/invite)\//iu.test(content); break;
      case 'links': triggered = (content.match(/https?:\/\/\S+/giu) ?? []).length >= threshold; break;
      case 'mentions': triggered = (content.match(/<@(?:[!&])?\d+>|@everyone|@here/gu) ?? []).length >= threshold; break;
      case 'attachments': triggered = (context.attachmentCount ?? 0) >= threshold; break;
      case 'emoji': triggered = (content.match(/<a?:\w+:\d+>|\p{Extended_Pictographic}/gu) ?? []).length >= threshold; break;
      case 'caps': {
        const letters = content.match(/\p{L}/gu) ?? [];
        triggered = letters.length > 0 && letters.filter(letter => letter !== letter.toLocaleLowerCase()).length / letters.length * 100 >= threshold;
        break;
      }
      case 'length': triggered = content.length >= threshold; break;
      case 'spam': triggered = (context.recentMessageCount ?? 0) >= threshold; break;
      case 'duplicate': triggered = (context.duplicateCount ?? 0) >= threshold; break;
      case 'new_account': triggered = context.event === 'member_join' && context.accountAgeDays < threshold; break;
      case 'username': triggered = !!config.pattern && await safeRegex(config.pattern, context.username ?? ''); break;
    }
    if (config.trigger !== 'new_account' && config.trigger !== 'username' && context.event !== 'message') triggered = false;
  }
  check('trigger', triggered, { field: config.trigger });
  return { triggered: passed && triggered, trace, actions: passed && triggered ? config.actions ?? [] : [] };
}
