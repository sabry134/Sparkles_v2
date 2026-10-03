import { FEATURES, ACTION_FIELDS, CONDITION_FIELDS, CAPABILITIES, TRIGGERS } from '../../../shared/platform-schema.js';
import { platformEnglish } from '../../../shared/platform-copy.js';

const copy = {
  'platform.search': 'Search', 'platform.create': 'Create', 'platform.choose': 'Choose…',
  'platform.refresh': 'Refresh',
  'platform.delete': 'Delete',
  'platform.deleteResourceTitle': 'Delete {name}',
  'platform.deleteResourceBody': 'Delete this draft permanently? This cannot be undone.',
  'platform.deleteResourceActive': 'Unpublish this item before deleting it.',
  'platform.deleteResourceBusy': 'Wait for the current job to finish before deleting it.',
  'platform.deleted': 'Deleted.', 'platform.saved': 'Saved.',
  'error.RESOURCE_ACTIVE': 'Unpublish this item before deleting it.',
  'error.RESOURCE_IN_USE': 'This item is still referenced by another configuration. Remove that reference before deleting it.', 'platform.name': 'Name', 'platform.description': 'Description',
  'platform.saveDraft': 'Save draft', 'platform.discard': 'Discard changes', 'platform.duplicate': 'Duplicate',
  'platform.copyName': '{name} (copy)', 'platform.empty': 'No records match these filters.',
  'platform.noResources': 'No saved items yet. Create one to get started.',
  'platform.startEditing': 'Choose a saved item or create a draft. Publishing always requires a separate action.',
  'platform.notAvailable': 'Not available', 'platform.emptyValue': 'Empty',
  'platform.firstPage': 'First page', 'platform.nextPage': 'Next page',
  'platform.requestFailed': 'The request failed. Review the values and try again.',
  'platform.requestReference': 'Support reference: {reference}',
  'platform.errorDetailsTitle': 'What is wrong',
  'platform.none': 'none',
  'platform.unknownField': 'unknown field',
  'errorDetail.missingCapability':
    'Required dashboard permission: {capability}. Your current dashboard permissions: {current}.',
  'errorDetail.noDashboardAccess':
    'Your account currently has no Sparkles dashboard permissions for this server. A server owner or dashboard access administrator must grant access.',
  'errorDetail.actorChannelPermission':
    'You cannot use channel {channel} because your Discord account is missing {permission} there.',
  'errorDetail.botPermissions':
    'Sparkles is missing Discord permission(s): {permissions}.',
  'errorDetail.botPermissionsChannel':
    'Sparkles is missing Discord permission(s): {permissions}. Channel: {channel}.',
  'errorDetail.actionPermission':
    'Action "{action}" requires {permission}. Missing for: {missingFor}.',
  'errorDetail.roleNotFound':
    'Role {role} does not exist in this server anymore.',
  'errorDetail.everyoneRole':
    'Role {role} is the @everyone role and cannot be used here.',
  'errorDetail.roleNotAssignable':
    'Role {role} cannot be assigned by Sparkles. Check whether it is managed by an integration or above the bot.',
  'errorDetail.roleManaged':
    'Role {role} is managed by Discord or an integration and cannot be assigned manually.',
  'errorDetail.botRoleTooLow':
    'Sparkles cannot manage role {role} because the bot\'s highest role is {highest}. Move the Sparkles role above the target role.',
  'errorDetail.actorMissingManageRoles':
    'You cannot manage role {role} because your Discord account is missing Manage Roles.',
  'errorDetail.actorRoleTooLow':
    'You cannot manage role {role} because your highest role is {highest}.',
  'errorDetail.unsafeRole':
    'Role {role} contains elevated permissions and cannot be exposed as a self-service role.',
  'errorDetail.roleInvalid':
    'Role {role} is invalid for {path}.',
  'errorDetail.channelNotFound':
    'Channel {channel} does not exist in this server anymore. Setting: {path}.',
  'errorDetail.channelDifferentGuild':
    'Channel {channel} belongs to another server.',
  'errorDetail.channelType':
    'Channel {channel} is not a supported text/thread destination.',
  'errorDetail.channelArchived':
    'Channel {channel} is an archived thread and cannot receive this action.',
  'errorDetail.channelLocked':
    'Channel {channel} is locked and cannot receive this action.',
  'errorDetail.categoryNotFound':
    'Category/channel {channel} is missing or is not a category. Setting: {path}.',
  'errorDetail.channelInvalid':
    'Channel {channel} is invalid for {path}.',
  'errorDetail.categoryId':
    'Category ID {id} is invalid for {path}.',
  'errorDetail.messageNotFound':
    'Discord message {messageId} could not be found in channel {channelId}. It may have been deleted or the link/ID is wrong.',
  'errorDetail.discordId':
    'Invalid Discord ID in {path}: "{value}". Discord IDs must contain 17–20 digits.',
  'errorDetail.resourceId':
    'Invalid Sparkles resource ID in {path}: "{value}". Expected a UUID.',
  'errorDetail.revision':
    'Invalid revision in {path}: "{value}". Reload the page and try again.',
  'errorDetail.genericPath':
    'The value in {path} is invalid.',
  'platform.unsavedConfirm': 'You have unsaved changes. Leave this editor and discard them?',
  'platform.unsavedTitle': 'Unsaved changes',
  'platform.leaveAnyway': 'Discard and leave',
  'platform.keepEditing': 'Keep editing',
  'platform.unsaved': 'Unsaved changes', 'platform.versionShort': 'v{version}',
  'platform.addAction': 'Add an action…', 'platform.addItem': 'Add item',
  'platform.actionStep': '{number}. {action}', 'platform.itemNumber': 'Item {number}',
  'platform.noActions': 'Add the ordered actions this rule will execute.',
  'platform.noItems': 'No items configured.', 'platform.multipleHelp': 'Use Ctrl or Command to select or clear several options.',
  'platform.unavailableObject': 'Unavailable object · {id}', 'platform.unmanageable': ' · Cannot assign',
  'platform.scheduleTimezone': 'Enter local time in {zone}. Execution times are stored in UTC.',
  'platform.userIdsHelp': 'Advanced: enter Discord user IDs separated by commas.',
  'platform.noChanges': 'No configuration changes.', 'platform.impactPreview': 'Review the impact',
  'platform.impactHelp': 'Check the destination, affected objects, and changes before executing this action.',
  'platform.actionValue': 'Action: {action}', 'platform.destinationValue': 'Destination: #{channel}',
  'platform.scheduledFor': 'Scheduled for {time}', 'platform.targetsCount': 'Affected members: {count}',
  'platform.confirmExecution': 'Confirm and execute', 'platform.details': 'Details',
  'platform.actions': 'Actions', 'platform.action': 'Action', 'platform.status': 'Status',
  'platform.scheduled': 'Scheduled / finished', 'platform.result': 'Result',
  'platform.openMessage': 'Open Discord message', 'platform.skipped': 'Skipped; see diagnostics',
  'platform.draftSaved': 'Draft saved. The live configuration is unchanged until you publish.',
  'platform.resourceTabs': 'Resource editor', 'platform.thread': 'Active thread',
  'platform.advancedDestination': 'Advanced destination ID',
  'platform.messageHelp': 'This shared message is used when the published feature sends content to Discord.',
  'platform.simulatorHelp': 'Test the saved draft against sample event data. The simulator runs the same evaluator as the bot and does not execute any actions.',
  'platform.runTest': 'Run test', 'platform.wouldTrigger': 'Would trigger', 'platform.wouldNotTrigger': 'Would not trigger',
  'platform.passed': 'Passed', 'platform.notPassed': 'Did not pass',
  'platform.rollbackHelp': 'Restore a previous revision into a new draft, review the differences, then publish when ready.',
  'platform.restoreDraft': 'Restore as draft', 'platform.restoredDraft': 'Previous configuration restored as a new draft.',
  'platform.allActivity': 'Open activity', 'platform.jobPending': 'An execution is pending. Inspect Activity for its result or cancel a queued job.',
  'platform.saveBeforePublish': 'Save your changes before testing or publishing.',
  'platform.publishHelp': 'Preview validates current Discord permissions and shows exactly what will be published.',
  'platform.updateDiscord': 'Preview Discord update', 'platform.enable': 'Preview and enable',
  'platform.previewPublish': 'Preview and publish', 'platform.sendTest': 'Preview test message',
  'platform.pause': 'Pause', 'platform.republish': 'Republish as new', 'platform.unpublish': 'Unpublish',
  'platform.queued': 'Queued for the bot. Execution history will show the Discord result.',
  'platform.allStatuses': 'All statuses', 'platform.actorValue': 'Changed by {actor}',
  'platform.noPermission': 'Your dashboard role does not allow this module.',
  'platform.chooseAuthorizedModule': 'Choose a module available to your dashboard role from the sidebar.',
  'platform.tab.configure': 'Configuration', 'platform.tab.message': 'Message Studio', 'platform.tab.test': 'Simulator',
  'platform.tab.history': 'Versions', 'platform.tab.activity': 'Execution history', 'platform.tab.builder': 'Builder', 'platform.tab.records': 'Records',
  'studio.app': 'APP', 'studio.separator': ' · ', 'studio.componentPreview': 'Component preview',
  'studio.emptyPreview': 'Your Discord message will appear here.', 'studio.characterCount': '{count} / {limit}',
  'studio.editorMode': 'Message editor mode', 'studio.compose': 'Compose', 'studio.json': 'Raw JSON',
  'studio.undo': 'Undo', 'studio.redo': 'Redo', 'studio.copyJson': 'Copy JSON', 'studio.copied': 'JSON copied.',
  'studio.copyFailed': 'Copy failed. Use Export to download the JSON instead.', 'studio.export': 'Export', 'studio.import': 'Import',
  'studio.exportFilename': 'sparkles-message', 'studio.imported': 'Message configuration imported.',
  'studio.invalidJson': 'The JSON is invalid or contains unsupported Discord fields. Review the message format and limits.',
  'studio.fileTooLarge': 'The file exceeds the configured import size limit.', 'studio.applyJson': 'Apply JSON',
  'studio.content': 'Message content · Markdown, emoji and mentions supported', 'studio.variables': 'Insert variable',
  'studio.channelMention': 'Insert channel mention', 'studio.roleMention': 'Insert role mention',
  'studio.embeds': 'Rich embeds', 'studio.addEmbed': 'Add embed', 'studio.embedNumber': 'Embed {number}',
  'studio.title': 'Title', 'studio.description': 'Description', 'studio.appearance': 'Author, images and appearance',
  'studio.titleUrl': 'Title link', 'studio.color': 'Color · hexadecimal', 'studio.author': 'Author name',
  'studio.authorUrl': 'Author link', 'studio.authorIcon': 'Author icon URL', 'studio.thumbnail': 'Thumbnail URL',
  'studio.image': 'Large image URL', 'studio.footer': 'Footer text', 'studio.footerIcon': 'Footer icon URL',
  'studio.timestamp': 'Timestamp · UTC', 'studio.fields': 'Embed fields', 'studio.addField': 'Add field',
  'studio.fieldNumber': 'Field {number}', 'studio.moveUp': 'Move up', 'studio.moveDown': 'Move down',
  'studio.remove': 'Remove', 'studio.fieldName': 'Field name', 'studio.fieldValue': 'Field value', 'studio.inline': 'Inline field',
  'studio.duplicateEmbed': 'Duplicate embed', 'studio.removeEmbed': 'Remove embed',
  'studio.componentsMentions': 'Buttons and allowed mentions',
  'studio.interactiveHelp': 'Add link buttons here. Role selectors, rule acceptance, ticket buttons, forms, polls and giveaways generate their own working controls when published.',
  'studio.buttonLabel': 'Button label', 'studio.buttonUrl': 'Button URL', 'studio.addLink': 'Add link button',
  'studio.mentionsHelp': 'Mentions are silent by default. Explicitly allow the people or roles that should receive a notification.',
  'studio.everyone': 'Allow @everyone and @here notifications', 'studio.allowedRoles': 'Roles allowed to receive mentions',
  'studio.allowedUsers': 'User IDs allowed to receive mentions', 'studio.reset': 'Reset message',
  'studio.livePreview': 'Discord preview', 'studio.mobile': 'Mobile', 'studio.desktop': 'Desktop',
  'studio.previewHelp': 'The preview reflects Discord structure and limits. Client fonts, link unfurls and member names can vary; use a test message to check the final rendering.',
  'studio.embedCharacters': '{count} / {limit} total embed characters', 'studio.useTemplate': 'Use a saved message as a template',
  'studio.issue.object': '{path}: expected an object.', 'studio.issue.unsupported': '{path}: unsupported field.',
  'studio.issue.text': '{path}: enter valid text.', 'studio.issue.limit': '{path}: exceeds the limit of {limit}.',
  'studio.issue.url': '{path}: enter an HTTP or HTTPS URL without credentials.', 'studio.issue.color': '{path}: enter a valid color.',
  'studio.issue.date': '{path}: enter a valid date.', 'studio.issue.boolean': '{path}: expected true or false.',
  'studio.issue.empty': '{path}: content is required.', 'studio.issue.component': '{path}: invalid component layout.',
  'studio.issue.linkOnly': '{path}: use link buttons here; interactive controls are managed by their feature.',
  'studio.issue.id': '{path}: invalid Discord ID.', 'studio.issue.mentions': '{path}: invalid allowed mentions.',
  'studio.issue.invalid': '{path}: check this value.', 'studio.issue.mapping': '{path}: choose a destination mapping.',
  'center.title': 'Command center', 'center.description': 'Server activity, publishing operations and configuration health in one place.',
  'center.dateRange': 'Date range', 'center.days': 'Last {count} days', 'center.custom': 'Custom range', 'center.from': 'From', 'center.to': 'To',
  'center.members': 'Members', 'center.online': '{count} approximately online', 'center.messages': 'Messages processed',
  'center.joins': 'Joins', 'center.leaves': 'Leaves', 'center.automod': 'Rule interventions', 'center.warnings': 'Warnings issued',
  'center.previous': '{count} in preceding period · change {change}',
  'center.collectionHelp': 'Activity counts cover events observed by the running bot. Collection begins when this version starts; earlier periods are not backfilled.',
  'center.cases': 'Moderation cases', 'center.openTickets': 'Open tickets', 'center.queued': 'Queued jobs', 'center.failed': 'Failed / review needed',
  'center.gateway': 'Bot worker', 'center.messageTrend': 'Message activity by hour', 'center.trendPoint': '{time}: {count} messages',
  'center.quickActions': 'Quick actions', 'center.setupHealth': 'Setup health', 'center.healthy': 'No configuration issues found in the current checks.',
  'center.fix': 'Review', 'center.activity': 'Recent activity', 'center.system': 'Bot', 'center.noActivity': 'No activity has been recorded in this period.',
  'health.deleted_channel': 'A referenced channel is unavailable', 'health.deleted_role': 'A referenced role has been deleted',
  'health.role_hierarchy': 'The bot cannot manage this role', 'health.deleted_category': 'A referenced category has been deleted',
  'health.missing_log_channel': 'Logging is enabled without a destination', 'health.channel_permission': 'The bot cannot send in this channel',
  'health.no_actions': 'An enabled rule has no actions', 'health.destination_missing': 'A published feature has no destination',
  'health.bot_permission': 'A bot permission is unavailable', 'health.overlapping_rules': 'Published rules have overlapping triggers',
  'rules.messageHelp': 'Choose the publishing layout in Configuration. Rule text generates the Discord message; this studio controls its surrounding content and visual style.',
  'records.jobs': 'Background jobs', 'records.jobs.help': 'Queued work, completed actions and failures reported by the Discord gateway worker.',
  'records.events': 'Activity and audit log', 'records.events.help': 'Administrative changes and runtime events, with the actor, time and recorded differences.',
  'records.tickets': 'Support queue', 'records.tickets.help': 'Claim tickets, add internal notes, close or reopen conversations and inspect saved transcripts.',
  'records.submissions': 'Form submissions', 'records.submissions.help': 'Review member responses and record an explicit decision.',
  'records.acceptances': 'Rules acceptance', 'records.acceptances.help': 'Each acceptance records the member, date and rules revision.',
  'jobs.empty': 'No jobs have been recorded here.', 'jobs.cancel': 'Cancel queued job', 'jobs.review': 'Resolve uncertain result',
  'jobs.reviewNote': 'Check Discord first. Describe what actually happened; resolving this record will not replay the action.',
  'jobs.recoveredMessage': 'If the bot sent the message, enter its Discord message ID to recover the managed reference. Otherwise leave this empty.',
  'tickets.assignee': 'Assigned to: {user}', 'tickets.unassigned': 'Unassigned', 'tickets.openChannel': 'Open ticket',
  'tickets.claim': 'Claim', 'tickets.close': 'Close', 'tickets.reopen': 'Reopen', 'tickets.addNote': 'Add staff note',
  'tickets.notePrompt': 'Internal staff note', 'tickets.transcript': 'Transcript',
  'tickets.closeImpact': 'Closing saves a transcript and prevents the member from sending new messages in this ticket. Staff can reopen it. Continue?',
  'tickets.transcriptCapped': 'This transcript reached the configured history limit; earlier messages are not included.',
  'members.title': 'Members', 'members.search': 'Search members', 'members.searchHelp': 'Search by name',
  'members.profile': 'Profile', 'members.created': 'Account created',
  'members.joined': 'Joined server', 'members.roles': 'Roles', 'members.timeout': 'Timeout until', 'members.tickets': 'Recent tickets',
  'cases.title': 'Cases', 'cases.help': 'Search members, issue actions, and review case history.',
  'cases.selected': '{count} members selected', 'cases.clearSelection': 'Clear selection', 'cases.previewAction': 'Preview moderation action',
  'cases.caseNumber': 'Case #{number}', 'cases.case': 'Case / action', 'cases.target': 'Target', 'cases.moderator': 'Moderator',
  'cases.reason': 'Reason', 'cases.date': 'Date', 'cases.actions': 'Actions', 'cases.evidence': 'Evidence', 'cases.openEvidence': 'Open source',
  'cases.editReason': 'Edit reason', 'cases.addNote': 'Add staff note', 'cases.reverse': 'Prepare reversal',
  'cases.reversalReason': 'Reversal of case #{number}', 'cases.empty': 'No moderation cases have been recorded.',
  'access.title': 'Dashboard access', 'access.help': 'Grant only the capabilities each staff role needs. The server owner and Discord administrators retain recovery access. Discord permissions and hierarchy are checked separately for dangerous actions.',
  'access.managerDefaults': 'Default capabilities for Manage Server members', 'access.userId': 'Or grant to a Discord user ID',
  'access.addGrant': 'Add grant', 'access.impact': 'Apply the access changes shown below? They take effect on subsequent API requests.',
  'access.save': 'Apply access policy', 'access.saved': 'Access policy saved.',
  'blueprints.title': 'Server blueprints', 'blueprints.help': 'Move selected bot configurations between servers. Map Discord objects explicitly; imports create drafts that must be reviewed and published.',
  'blueprints.filename': 'sparkles-blueprint', 'blueprints.export': 'Export blueprint', 'blueprints.import': 'Choose blueprint file',
  'blueprints.modules': 'Modules to import', 'blueprints.mapping': 'Map source objects to this server',
  'blueprints.mapObject': 'Destination for {name}', 'blueprints.preview': 'Preview import',
  'blueprints.draftOnly': '{count} drafts will be created. No Discord content will be sent.',
  'blueprints.imported': 'Imported {count} drafts. Open each module to review and publish.',
  'trace.exemption': 'Exemption applies: {field} {expected}',
  'trace.condition': '{field}: expected {expected}; observed {actual}',
  'trace.trigger': 'Trigger: {field}', 'trace.restriction': 'Access restriction: {field}',
  'navigation.search': 'Search', 'navigation.palette': 'Go to',
  'navigation.paletteHelp': 'Search pages and saved configurations.',
  'navigation.overview': 'Overview', 'navigation.moderation': 'Moderation', 'navigation.community': 'Community',
  'navigation.messages': 'Messaging', 'navigation.configuration': 'Settings',
  'navigation.legacy': 'Existing settings', 'navigation.savedSettings': 'Configured behavior',
  'common.cancel': 'Cancel', 'common.close': 'Close',
  'nav.rules': 'Rules studio', 'nav.tickets': 'Tickets', 'nav.forms': 'Forms', 'nav.giveaways': 'Giveaways', 'nav.polls': 'Polls',
  'nav.feeds': 'Social feeds', 'nav.members': 'Members', 'nav.activity': 'Activity log', 'nav.jobs': 'Background jobs', 'nav.access': 'Dashboard access', 'nav.blueprints': 'Blueprints',
  'nav.embeds': 'Message Studio', 'embeds.description': 'Draft, preview, publish and update managed Discord messages.',
};

const features = {
  messages: ['Messages and schedules', 'Compose reusable raw or rich messages. Publish now, schedule a UTC instant, or repeat at a configured interval. Managed message IDs let you update published content.'],
  rules: ['Rules publishing studio', 'Build structured rules, choose a Discord layout, and track versioned member acceptance and safe role grants.'],
  'role-panels': ['Self-role panels', 'Publish buttons or selection menus with eligibility checks, mutually exclusive choices and optional temporary roles.'],
  'ticket-panels': ['Ticket panels', 'Create private support conversations from published panels, optionally collecting a form before opening.'],
  forms: ['Forms', 'Publish Discord forms with short or paragraph fields and review submissions in the dashboard.'],
  giveaways: ['Giveaways', 'Publish an entry button, enforce eligibility and select winners automatically at the closing time.'],
  polls: ['Polls', 'Collect single or multiple choices through a Discord menu. Publish totals at closing; anonymous polls store keyed voter references.'],
  workflows: ['Workflows', 'Choose WHEN an event occurs, IF conditions match, THEN ordered actions. Delays resume from durable jobs and recheck conditions.'],
  'automod-rules': ['Independent Automod rules', 'Configure triggers, explicit exemptions, conditions and ordered actions. Test the same evaluator the bot uses before enabling a rule.'],
  commands: ['Custom command builder', 'Publish slash commands or message triggers with role and channel restrictions, cooldowns and a Message Studio response.'],
  feeds: ['GitHub release notifications', 'Follow a public GitHub repository and send new releases through Message Studio. Use {release.name}, {release.tag} and {release.url} in message text.'],
};
for (const [key, [title, description]] of Object.entries(features)) {
  copy[`feature.${key}.title`] = title; copy[`feature.${key}.description`] = description;
}
const humanize = text => text.replace(/([a-z])([A-Z])/gu, '$1 $2').replace(/[_-]/gu, ' ').replace(/^./u, char => char.toUpperCase());
function fields(specs) {
  for (const [key, spec] of Object.entries(specs)) {
    copy[`field.${key}`] = humanize(key);
    if (spec.options) for (const value of spec.options) copy[`choice.${value || 'none'}`] = value ? humanize(value) : 'None';
    if (spec.fields) fields(spec.fields);
    if (spec.item?.fields) fields(spec.item.fields);
  }
}
for (const feature of Object.values(FEATURES)) fields(feature.fields);
for (const [action, specs] of Object.entries(ACTION_FIELDS)) { copy[`choice.${action}`] = humanize(action); fields(specs); }
for (const field of [...CONDITION_FIELDS, ...TRIGGERS, 'content', 'recentMessageCount', 'duplicateCount', 'attachmentCount', 'commandName', 'roleIds', 'userId', 'type']) copy[`field.${field}`] ??= humanize(field);
for (const key of ['none', 'unban', 'untimeout', 'note', 'automod', 'active', 'normal', 'urgent', 'command']) copy[`choice.${key}`] ??= key === 'automod' ? 'Auto moderation' : humanize(key);
for (const capability of CAPABILITIES) copy[`capability.${capability}`] = humanize(capability);
for (const status of ['draft', 'published', 'changed', 'queued', 'running', 'completed', 'failed', 'needs_review', 'cancelled', 'reviewed', 'open', 'pending', 'closed', 'accepted', 'rejected', 'archived', 'active', 'online', 'offline']) copy[`status.${status}`] = ({ changed: 'Changed since publication', needs_review: 'Needs review' })[status] ?? humanize(status);
for (const action of ['publish', 'republish', 'unpublish', 'test', 'pause', 'workflow', 'feed', 'close_giveaway', 'close_poll', 'moderate', 'case_update', 'expire_role', 'expire_ban', 'ticket']) copy[`action.${action}`] = humanize(action);
for (const event of ['draft_saved', 'job_queued', 'job_completed', 'job_failed', 'job_cancelled', 'job_reviewed', 'settings_changed', 'access_changed', 'submission_reviewed', 'moderation', 'workflow_log', 'member_join', 'member_leave', 'reaction_add', 'role_add', 'role_remove', 'voice_join', 'voice_leave', 'ticket_created', 'ticket_closed', 'rules_accepted', 'warning', 'self_roles_changed', 'interaction_failed', 'command_executed', 'command_failed']) copy[`event.${event}`] = humanize(event);
for (const [key, value] of Object.entries(copy)) if (key.startsWith('choice.')) copy[`field.${key.slice('choice.'.length)}`] ??= value;
Object.assign(copy, {
  'field.channelId': 'Destination channel', 'field.acceptanceRoleId': 'Role granted after acceptance', 'field.revokeRoleId': 'Role removed on revocation',
  'field.intervalSeconds': 'Repeat interval in seconds · 0 for one-time', 'field.startAt': 'Scheduled start · leave empty for now',
  'field.durationSeconds': 'Duration in seconds · 0 for permanent', 'field.endAt': 'Closing time',
  'field.cooldownSeconds': 'Cooldown per member in seconds', 'field.exemptAdministrators': 'Explicitly exempt administrators',
  'field.nameFormat': 'Ticket name · supports {user} and {id}', 'field.repository': 'GitHub repository · owner/name',
  'field.timezone': 'Schedule timezone label', 'field.minimumAccountAgeDays': 'Minimum account age in days',
  'field.minimumMembershipAgeDays': 'Minimum server membership age in days', 'field.maximumTickets': 'Maximum open tickets per member',
  'field.autoCloseSeconds': 'Auto-close after inactivity in seconds · 0 to disable', 'field.slaSeconds': 'Response target in seconds · 0 to disable',
  'error.REVISION_CONFLICT': 'This item changed in another session. Reload it before saving or publishing.',
  'error.DASHBOARD_FORBIDDEN':
    'This action is blocked by your dashboard access permissions. See the exact requirement below.',
  'error.RESOURCE_BUSY': 'This item already has a pending job. Inspect its activity or cancel the queued job.',
  'error.RESOURCE_LIMIT': 'The configured limit for this module has been reached.',
  'error.MESSAGE_INVALID': 'The message exceeds a Discord limit or contains an invalid field.',
  'error.PREVIEW_EXPIRED': 'The preview expired or has already been used. Generate a new preview.',
  'error.ROLE_HIERARCHY': 'The bot cannot manage this role. Check its position and Manage Roles permission.',
  'error.ACTOR_ROLE_HIERARCHY': 'Your Discord role is too low or lacks the permission needed for this action.',
  'error.MEMBER_HIERARCHY': 'The selected member cannot be moderated because of Discord hierarchy or permissions.',
  'error.DANGEROUS_SELF_ROLE': 'Self-service panels cannot grant roles with administrative or moderation permissions.',
  'error.ACTION_PERMISSION': 'You or the bot lack a Discord permission required by this action.',
  'error.DISCORD_OBJECT_DELETED': 'The Discord object no longer exists or is unavailable to the bot.',
  'error.DISCORD_REQUEST_FAILED': 'The Discord request failed. Check the execution details before retrying.',
  'error.CHANNEL_UNAVAILABLE': 'The destination is archived, locked or unavailable.',
  'error.MENTION_PERMISSION': 'You and the bot need Mention Everyone to send these role or everyone notifications.',
  'error.MESSAGE_NOT_OWNED': 'This message is not owned by this bot and cannot be managed here.',
  'error.DESTINATION_REQUIRED': 'Choose a destination before publishing.',
  'error.DESTINATION_CHANGED': 'Unpublish the current message or explicitly republish as new to change its destination.',
  'error.NOT_PUBLISHED': 'This item has not been published yet.', 'error.INVALID_ACTION': 'This action is not supported for the selected item.',
  'error.INVALID_INTERVAL': 'Set an interval at or above the configured minimum.', 'error.INVALID_SCHEDULE': 'The closing time must be after the start and in the future.',
  'error.RULE_PATTERN_REQUIRED': 'Enter the text or expression this rule should match.', 'error.RULE_THRESHOLD_REQUIRED': 'Set a positive trigger threshold.',
  'error.REGEX_INVALID': 'The regular expression is invalid or exceeds the configured limit.', 'error.REGEX_TIMEOUT': 'The regular expression exceeded its execution limit. Simplify it.',
  'error.COMMAND_CONFLICT': 'A command with this name already exists. Choose a unique name.',
  'error.FORM_UNAVAILABLE': 'The linked form must be published and enabled first.',
  'error.TICKET_LIMIT': 'This member has reached the configured open-ticket limit.',
  'error.FEED_UNAVAILABLE': 'GitHub could not return the public repository releases. Check the repository and execution history.',
  'error.BLUEPRINT_MAPPING_REQUIRED': 'Map all referenced channels, categories and roles before importing.',
  'error.IMPORT_TOO_LARGE': 'The imported file exceeds the configured size limit.',
  'error.EXECUTION_FAILED': 'Execution failed. Inspect permissions and the recorded step results.',
  'error.EXECUTION_UNCERTAIN': 'The worker stopped before confirming the result. Check Discord and resolve this record; it will not be replayed automatically.',
  'error.JOB_LEASE_LOST': 'Another process owns this job. Inspect the current execution record.',
  'error.JOB_NOT_CANCELLABLE': 'Only queued jobs can be cancelled.', 'error.JOB_NOT_REVIEWABLE': 'This job is not awaiting review.',
  'error.MEMBER_REQUIRED': 'This action needs an event with a member.', 'error.MESSAGE_REQUIRED': 'This action needs an event with a Discord message.',
  'error.COMMAND_DENIED': 'The command restrictions or cooldown prevented execution.', 'error.INVALID_CATEGORY': 'Choose an available Discord category.',
});

export const platformEn = { ...platformEnglish, ...copy };
