// English is currently the project's only supported locale. All platform copy lives here.
export const platformEnglish = {
  'rules.examplesValue': 'Examples: {value}',
  'rules.severityValue': 'Severity: {value}',
  'rules.punishmentValue': 'Consequence: {value}',
  'rules.previous': 'Previous rule', 'rules.next': 'Next rule',
  'rules.accepted': 'You accepted version {version} of {name}.',
  'rules.acceptanceLog': '{user} accepted {name}, version {version}.',
  'giveaway.ends': '{count} winner(s) · Ends {time}',
  'giveaway.entered': 'Your entry has been recorded.',
  'giveaway.ended': '{prize}\nWinners: {winners}',
  'giveaway.noWinners': 'No eligible entries',
  'poll.voted': 'Your vote has been recorded.', 'poll.results': '{question}\n{results}',
  'interaction.expired': 'This panel is no longer active. Ask a server administrator to publish its current version.',
  'interaction.ineligible': 'Your account or server membership does not meet this panel’s requirements.',
  'interaction.failed': 'The action could not be completed. Server staff can inspect the execution history.',
  'roles.updated': 'Your roles have been updated.',
  'form.received': 'Your submission has been received.',
  'form.notification': 'New submission for {name}\n{answers}',
  'ticket.created': 'Your ticket is ready: {channel}',
  'ticket.welcome': '{user}, your support ticket is open.',
  'ticket.claim': 'Claim', 'ticket.close': 'Close ticket',
  'ticket.claimed': 'This ticket is assigned to {user}.',
  'ticket.closed': 'This ticket is closed. Staff can reopen it from the dashboard.',
  'ticket.transcript': 'Transcript for ticket {id}\n{url}',
  'choice.low': 'Low', 'choice.medium': 'Medium', 'choice.high': 'High',
};
export function platformTranslate(key, variables = {}) {
  return (platformEnglish[key] ?? key).replace(/\{([A-Za-z0-9_]+)\}/gu, (match, name) => Object.hasOwn(variables, name) ? String(variables[name]) : match);
}
