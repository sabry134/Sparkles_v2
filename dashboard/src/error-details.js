import { t } from './i18n/index.js';

const CAPABILITY_KEYS = Object.freeze({
  view_analytics: 'capability.viewAnalytics',
  manage_messages: 'capability.manageMessages',
  publish_messages: 'capability.publishMessages',
  manage_rules: 'capability.manageRules',
  manage_roles: 'capability.manageRoles',
  manage_automod: 'capability.manageAutomod',
  moderate_members: 'capability.moderateMembers',
  manage_tickets: 'capability.manageTickets',
  view_transcripts: 'capability.viewTranscripts',
  manage_commands: 'capability.manageCommands',
  manage_workflows: 'capability.manageWorkflows',
  manage_integrations: 'capability.manageIntegrations',
  manage_community: 'capability.manageCommunity',
  view_audit: 'capability.viewAudit',
  manage_settings: 'capability.manageSettings',
  manage_access: 'capability.manageAccess',
});

export function capabilityLabel(capability) {
  const key = CAPABILITY_KEYS[capability];
  return key ? t(key) : capability;
}

function resourceLabel(name, id) {
  if (name && id) return `${name} (${id})`;
  if (name) return name;
  if (id) return id;
  return t('platform.notAvailable');
}

function listCapabilities(capabilities) {
  if (!Array.isArray(capabilities) || !capabilities.length) {
    return t('platform.none');
  }
  return capabilities.map(capabilityLabel).join(', ');
}

function listPermissions(permissions) {
  if (!Array.isArray(permissions) || !permissions.length) {
    return t('platform.notAvailable');
  }
  return permissions.join(', ');
}

export function errorDetailText(detail = {}) {
  const path = detail.path || t('platform.unknownField');

  switch (detail.code) {
    case 'missing_capability':
      return t('errorDetail.missingCapability', {
        capability: capabilityLabel(detail.capability),
        current: listCapabilities(detail.currentCapabilities),
      });
    case 'no_dashboard_access':
      return t('errorDetail.noDashboardAccess');
    case 'actor_channel_permission':
      return t('errorDetail.actorChannelPermission', {
        channel: resourceLabel(detail.channelName, detail.channelId),
        permission: detail.permission ?? 'View Channel',
      });
    case 'bot_permissions':
      return t('errorDetail.botPermissions', {
        permissions: listPermissions(detail.permissions),
        channel: resourceLabel(detail.channelName, detail.channelId),
      });
    case 'action_permission':
      return t('errorDetail.actionPermission', {
        action: detail.action ?? t('platform.notAvailable'),
        permission: detail.permission ?? t('platform.notAvailable'),
        missingFor: Array.isArray(detail.missingFor)
          ? detail.missingFor.join(' and ')
          : t('platform.notAvailable'),
      });
    case 'role': {
      const role = resourceLabel(detail.roleName, detail.roleId);
      const reasons = {
        not_found: t('errorDetail.roleNotFound', { role }),
        everyone_role: t('errorDetail.everyoneRole', { role }),
        not_assignable: t('errorDetail.roleNotAssignable', { role }),
        managed_by_discord_or_integration: t('errorDetail.roleManaged', { role }),
        bot_role_too_low: t('errorDetail.botRoleTooLow', {
          role,
          highest: resourceLabel(
            detail.botHighestRoleName,
            detail.botHighestRoleId,
          ),
        }),
        actor_missing_manage_roles: t('errorDetail.actorMissingManageRoles', {
          role,
        }),
        actor_role_too_low: t('errorDetail.actorRoleTooLow', {
          role,
          highest: resourceLabel(
            detail.actorHighestRoleName,
            detail.actorHighestRoleId,
          ),
        }),
        unsafe_permissions: t('errorDetail.unsafeRole', { role }),
      };
      return reasons[detail.reason] ?? t('errorDetail.roleInvalid', { role, path });
    }
    case 'channel': {
      const channel = resourceLabel(detail.channelName, detail.channelId);
      const reasons = {
        not_found: t('errorDetail.channelNotFound', { channel, path }),
        different_guild: t('errorDetail.channelDifferentGuild', { channel }),
        unsupported_channel_type: t('errorDetail.channelType', { channel }),
        archived: t('errorDetail.channelArchived', { channel }),
        locked: t('errorDetail.channelLocked', { channel }),
        not_found_or_not_category: t('errorDetail.categoryNotFound', {
          channel,
          path,
        }),
      };
      return reasons[detail.reason] ?? t('errorDetail.channelInvalid', {
        channel,
        path,
      });
    }
    case 'category':
      return t('errorDetail.categoryId', {
        id: detail.categoryId ?? t('platform.notAvailable'),
        path,
      });
    case 'message':
      return t('errorDetail.messageNotFound', {
        messageId: detail.messageId ?? t('platform.notAvailable'),
        channelId: detail.channelId ?? t('platform.notAvailable'),
      });
    case 'id':
      return t('errorDetail.discordId', {
        path,
        value: detail.value ?? t('platform.notAvailable'),
      });
    case 'resource_id':
      return t('errorDetail.resourceId', {
        path,
        value: detail.value ?? t('platform.notAvailable'),
      });
    case 'revision':
      return t('errorDetail.revision', {
        path,
        value: detail.value ?? t('platform.notAvailable'),
      });
    default: {
      const issueKey = `studio.issue.${detail.code}`;
      const issue = t(issueKey, {
        path,
        limit: detail.limit,
      });
      if (issue !== issueKey) return issue;
      return detail.path
        ? t('errorDetail.genericPath', { path })
        : t('platform.requestFailed');
    }
  }
}

export function errorDetailsText(details = []) {
  if (!Array.isArray(details)) return [];
  return details.map(errorDetailText).filter(Boolean);
}
