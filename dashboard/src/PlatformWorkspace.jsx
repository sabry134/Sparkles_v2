import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Select as MuiSelect,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { api } from './api.js';
import { t } from './i18n/index.js';
import { errorDetailsText } from './error-details.js';
import Icon from './Icon.jsx';
import MessageStudio, { MessagePreview, downloadJson } from './MessageStudio.jsx';
import { ACTION_FIELDS, FEATURES, emptyResource, configurationDiff } from '../../shared/platform-schema.js';
import { EMPTY_MESSAGE } from '../../shared/discord-limits.js';
import { useUiDialog } from './MuiProvider.jsx';
import './platform.css';

export const PLATFORM_PAGES = ['rules', 'tickets', 'forms', 'giveaways', 'polls', 'feeds', 'members', 'activity', 'jobs', 'access', 'blueprints'];
const pageKinds = { embeds: 'messages', rules: 'rules', roles: 'role-panels', tickets: 'ticket-panels', forms: 'forms', giveaways: 'giveaways', polls: 'polls', automation: 'workflows', automod: 'automod-rules', custom: 'commands', feeds: 'feeds' };
const label = key => t(`field.${key}`);
const choice = key => t(`choice.${key || 'none'}`);
const time = value => value ? new Date(value).toLocaleString() : t('platform.notAvailable');
const textValue = value => value === null || value === undefined ? t('platform.emptyValue') : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);

export function PlatformErrorView({ error }) {
  if (!error) return null;
  const key = `error.${error.code}`;
  const message = t(key);
  const details = errorDetailsText(error.details);
  return (
    <Paper
      className="platform-error mui-platform-error"
      elevation={0}
      sx={{
        p: 2,
        border: '1px solid',
        borderColor: 'error.dark',
        backgroundColor: 'rgba(239, 109, 120, 0.08)',
      }}
    >
      <Stack direction="row" spacing={1.25} alignItems="flex-start">
        <Box sx={{ color: 'error.main', pt: 0.25 }}>●</Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {message === key ? t('platform.requestFailed') : message}
          </Typography>
          {details.length ? (
            <Box sx={{ mt: 1.25 }}>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: 'block', mb: 0.5, fontWeight: 700 }}
              >
                {t('platform.errorDetailsTitle')}
              </Typography>
              <Stack component="ul" spacing={0.5} sx={{ pl: 2.5, mb: 0, mt: 0 }}>
                {details.map((detail, index) => (
                  <Typography component="li" variant="body2" key={index}>
                    {detail}
                  </Typography>
                ))}
              </Stack>
            </Box>
          ) : null}
          {error.requestId ? (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: 'block', mt: details.length ? 1.25 : 0.75 }}
            >
              {t('platform.requestReference', { reference: error.requestId })}
            </Typography>
          ) : null}
        </Box>
      </Stack>
    </Paper>
  );
}
function Empty({ text = 'platform.empty', children }) { return <div className="platform-empty"><p>{t(text)}</p>{children}</div>; }
function Busy() { return <div className="platform-skeleton" role="status" aria-label={t('common.loading')}><span /><span /><span /></div>; }
function Pager({ cursor, onNext, onFirst, busy }) { return <div className="platform-pagination"><Button type="button" className="button secondary" onClick={onFirst} disabled={busy}>{t('platform.firstPage')}</Button><Button type="button" className="button secondary" onClick={() => onNext(cursor)} disabled={!cursor || busy}>{t('platform.nextPage')}</Button></div>; }
function Status({ value }) {
  return (
    <Chip
      className={`platform-badge status-${value}`}
      size="small"
      variant="outlined"
      label={t(`status.${value}`)}
    />
  );
}

function useUnsaved(dirty) {
  const dialogs = useUiDialog();

  useEffect(() => {
    if (!dirty) return undefined;

    const beforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const guard = () =>
      dialogs.confirm({
        title: t('platform.unsavedTitle'),
        message: t('platform.unsavedConfirm'),
        confirmLabel: t('platform.leaveAnyway'),
        cancelLabel: t('platform.keepEditing'),
      });

    window.__sparklesNavigationGuard = guard;
    window.addEventListener('beforeunload', beforeUnload);

    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      if (window.__sparklesNavigationGuard === guard) {
        delete window.__sparklesNavigationGuard;
      }
    };
  }, [dirty, dialogs]);
}

function defaultField(spec, limits) {
  if (spec.type === 'object') return Object.fromEntries(Object.entries(spec.fields).map(([key, field]) => [key, defaultField(field, limits)]));
  if (spec.type === 'select') return spec.options[0];
  if (spec.type === 'boolean') return false;
  if (spec.type === 'number') return spec.min ?? 0;
  if (spec.type === 'timezone') return Intl.DateTimeFormat().resolvedOptions().timeZone || limits.defaultTimezone;
  if (spec.type === 'message') return structuredClone(EMPTY_MESSAGE);
  if (['roles', 'channels', 'users', 'actions', 'list'].includes(spec.type)) return [];
  return '';
}

function SchemaField({ name, spec, value, onChange, resources, limits, forms = [] }) {
  const caption = label(name);
  const dragIndex = useRef(null);
  const common = { resources, limits, forms };
  if (spec.type === 'boolean') {
    return (
      <FormControlLabel
        className="platform-check mui-platform-check"
        control={
          <Checkbox
            checked={value === true}
            onChange={(event) => onChange(event.target.checked)}
          />
        }
        label={caption}
      />
    );
  }
  if (spec.type === 'message') return <section className="platform-field-message"><h4>{caption}</h4><MessageStudio value={value ?? structuredClone(EMPTY_MESSAGE)} onChange={onChange} resources={resources} limits={limits} /></section>;
  if (spec.type === 'object') return <div className="platform-form-grid">{Object.entries(spec.fields).map(([key, child]) => <SchemaField key={key} name={key} spec={child} value={value?.[key]} onChange={next => onChange({ ...value, [key]: next })} {...common} />)}</div>;
  if (spec.type === 'actions' || spec.type === 'list') {
    const rows = value ?? []; const max = spec.max ?? limits[spec.limit ?? 'maximumSteps'];
    const move = (from, to) => { if (from < 0 || to < 0 || to >= rows.length || from === to) return; const next = [...rows]; next.splice(to, 0, next.splice(from, 1)[0]); onChange(next); };
    return <section className="platform-list-editor"><div className="studio-section-heading"><h4>{caption}{spec.required && <span aria-hidden="true"> *</span>}</h4>
      {spec.type === 'actions' ? (
        <FormControl size="small" sx={{ minWidth: 210 }}>
          <MuiSelect
            displayEmpty
            aria-label={t('platform.addAction')}
            value=""
            disabled={rows.length >= max}
            onChange={(event) => {
              const type = event.target.value;
              if (type) {
                onChange([
                  ...rows,
                  {
                    type,
                    ...Object.fromEntries(
                      Object.entries(ACTION_FIELDS[type]).map(([key, childSpec]) => [
                        key,
                        defaultField(childSpec, limits),
                      ]),
                    ),
                  },
                ]);
              }
            }}
          >
            <MenuItem value="">{t('platform.addAction')}</MenuItem>
            {Object.keys(ACTION_FIELDS).map((type) => (
              <MenuItem key={type} value={type}>
                {choice(type)}
              </MenuItem>
            ))}
          </MuiSelect>
        </FormControl>
      ) : (
        <Button
          type="button"
          variant="outlined"
          disabled={rows.length >= max}
          onClick={() => onChange([...rows, defaultField(spec.item, limits)])}
        >
          {t('platform.addItem')}
        </Button>
      )}
    </div>
      {rows.map((row, index) => <div className="platform-array-row" key={index} draggable onDragStart={() => { dragIndex.current = index; }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); move(dragIndex.current, index); }}>
        <div className="studio-field-top"><strong>{spec.type === 'actions' ? t('platform.actionStep', { number: index + 1, action: choice(row.type) }) : t('platform.itemNumber', { number: index + 1 })}</strong><div className="platform-actions"><Button type="button" aria-label={t('studio.moveUp')} disabled={!index} onClick={() => move(index, index - 1)}>↑</Button><Button type="button" aria-label={t('studio.moveDown')} disabled={index === rows.length - 1} onClick={() => move(index, index + 1)}>↓</Button><Button type="button" onClick={() => onChange(rows.filter((_, position) => position !== index))}>{t('studio.remove')}</Button></div></div>
        <SchemaField name={spec.type === 'actions' ? row.type : name} spec={spec.type === 'actions' ? { type: 'object', fields: ACTION_FIELDS[row.type] } : spec.item} value={row} onChange={next => onChange(rows.map((item, position) => position === index ? next : item))} {...common} />
      </div>)}
      {!rows.length && <p className="muted">{t(spec.type === 'actions' ? 'platform.noActions' : 'platform.noItems')}</p>}
    </section>;
  }
  const multiple = ['roles', 'channels', 'users'].includes(spec.type);
  let options = null;
  if (spec.type === 'select') options = spec.options.map(option => ({ id: option, name: choice(option) }));
  if (['role', 'roles'].includes(spec.type)) options = resources.roles.map(role => ({ ...role, disabled: spec.type === 'role' && (!role.assignable || role.dangerous) }));
  if (['channel', 'channels'].includes(spec.type)) options = resources.channels.filter(channel => [0, 5].includes(channel.type));
  if (spec.type === 'category') options = resources.categories;
  if (spec.type === 'resource') options = forms.map(form => ({ id: form.id, name: form.draft.name }));
  if (options) {
    const existing = multiple ? value ?? [] : value ? [value] : [];
    const unavailable = existing.filter(id => !options.some(option => option.id === id));
    return (
      <label className="platform-field mui-platform-field">
        <span>
          {caption}
          {spec.required && ' *'}
        </span>
        <FormControl size="small" fullWidth required={spec.required}>
          <MuiSelect
            multiple={multiple}
            displayEmpty={!multiple}
            value={value ?? (multiple ? [] : '')}
            onChange={(event) =>
              onChange(
                multiple
                  ? typeof event.target.value === 'string'
                    ? event.target.value.split(',')
                    : event.target.value
                  : event.target.value,
              )
            }
            renderValue={(selected) => {
              if (!multiple) {
                if (!selected) return t('platform.choose');
                const option = options.find((item) => item.id === selected);
                return option?.name ?? t('platform.unavailableObject', { id: selected });
              }
              const ids = Array.isArray(selected) ? selected : [];
              if (!ids.length) return t('platform.choose');
              return ids
                .map((id) => options.find((item) => item.id === id)?.name ?? id)
                .join(', ');
            }}
          >
            {!multiple ? <MenuItem value="">{t('platform.choose')}</MenuItem> : null}
            {unavailable.map((id) => (
              <MenuItem key={id} value={id}>
                {t('platform.unavailableObject', { id })}
              </MenuItem>
            ))}
            {options.map((option) => (
              <MenuItem value={option.id} key={option.id} disabled={option.disabled}>
                {multiple ? (
                  <Checkbox
                    size="small"
                    checked={(value ?? []).includes(option.id)}
                    sx={{ mr: 1 }}
                  />
                ) : null}
                {option.name}
                {option.disabled ? t('platform.unmanageable') : ''}
              </MenuItem>
            ))}
          </MuiSelect>
        </FormControl>
        {multiple ? <small className="muted">{t('platform.multipleHelp')}</small> : null}
      </label>
    );
  }
  const displayValue =
    spec.type === 'date' && value
      ? new Date(
          Date.parse(value) - new Date(value).getTimezoneOffset() * 60000,
        )
          .toISOString()
          .slice(0, 16)
      : spec.type === 'users'
        ? (value ?? []).join(', ')
        : value ?? '';

  return (
    <label className="platform-field mui-platform-field">
      <span>
        {caption}
        {spec.required && ' *'}
      </span>
      <TextField
        fullWidth
        multiline={spec.multiline}
        minRows={spec.multiline ? 3 : undefined}
        type={
          spec.type === 'number'
            ? 'number'
            : spec.type === 'date'
              ? 'datetime-local'
              : 'text'
        }
        required={spec.required}
        value={displayValue}
        inputProps={{
          min: spec.min,
          max: spec.max ?? limits[spec.limit],
        }}
        onChange={(event) => {
          const next = event.target.value;
          onChange(
            spec.type === 'number'
              ? next === ''
                ? ''
                : Number(next)
              : spec.type === 'date'
                ? next
                  ? new Date(next).toISOString()
                  : ''
                : spec.type === 'users'
                  ? next.split(/[\s,]+/u).filter(Boolean)
                  : next,
          );
        }}
      />
      {spec.type === 'date' ? (
        <small className="muted">
          {t('platform.scheduleTimezone', {
            zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          })}
        </small>
      ) : null}
      {spec.type === 'users' ? (
        <small className="muted">{t('platform.userIdsHelp')}</small>
      ) : null}
    </label>
  );
}

function ChangeList({ changes }) {
  if (!changes?.length) return <p className="muted">{t('platform.noChanges')}</p>;
  return (
    <div className="platform-diff">
      {changes.map((change, index) => (
        <Accordion
          key={index}
          disableGutters
          elevation={0}
          className="mui-inline-accordion"
        >
          <AccordionSummary>{change.path}</AccordionSummary>
          <AccordionDetails>
            <div className="mui-diff-grid">
              <pre className="diff-before">{textValue(change.before)}</pre>
              <pre className="diff-after">{textValue(change.after)}</pre>
            </div>
          </AccordionDetails>
        </Accordion>
      ))}
    </div>
  );
}
function EvidenceDetails({ evidence }) {
  if (!evidence) return null;
  const attachments = Array.isArray(evidence.attachments) ? evidence.attachments : [];
  return (
    <Stack spacing={1.25} className="case-evidence">
      {evidence.content ? (
        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {evidence.content}
        </Typography>
      ) : null}
      <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
        {evidence.reference ? (
          <Button
            component="a"
            href={evidence.reference}
            target="_blank"
            rel="noreferrer"
            variant="outlined"
            size="small"
          >
            {t('cases.openEvidence')}
          </Button>
        ) : null}
        {attachments.map((attachment, index) =>
          attachment?.url ? (
            <Button
              component="a"
              href={attachment.url}
              target="_blank"
              rel="noreferrer"
              variant="text"
              size="small"
              key={attachment.url}
            >
              {attachment.name || t('moderation.attachment')} {index + 1}
            </Button>
          ) : null,
        )}
      </Stack>
    </Stack>
  );
}

function ImpactDialog({ preview, resources, onClose, onConfirm, busy }) {
  return (
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>{t('platform.impactPreview')}</DialogTitle>
      <DialogContent dividers>
        <DialogContentText sx={{ mb: 2 }}>
          {t('platform.impactHelp')}
        </DialogContentText>
        {preview.impact.name ? <h3>{preview.impact.name}</h3> : null}
        {preview.impact.action ? (
          <p>
            {t('platform.actionValue', {
              action: t(`action.${preview.impact.action}`),
            })}
          </p>
        ) : null}
        {preview.impact.channelId ? (
          <p>
            {t('platform.destinationValue', {
              channel:
                resources.channels.find(
                  (channel) => channel.id === preview.impact.channelId,
                )?.name ?? preview.impact.channelId,
            })}
          </p>
        ) : null}
        {preview.impact.runAt ? (
          <p>{t('platform.scheduledFor', { time: time(preview.impact.runAt) })}</p>
        ) : null}
        {preview.impact.targets ? (
          <>
            <p>{t('platform.targetsCount', { count: preview.impact.targets.length })}</p>
            <ul>
              {preview.impact.targets.map((target) => (
                <li key={target.id}>{target.name}</li>
              ))}
            </ul>
            <p>{preview.impact.reason}</p>
          </>
        ) : null}
        {preview.impact.draftOnly ? (
          <p>{t('blueprints.draftOnly', { count: preview.impact.count })}</p>
        ) : null}
        {preview.impact.message ? (
          <MessagePreview value={preview.impact.message} resources={resources} />
        ) : null}
        <ChangeList changes={preview.impact.changes} />
      </DialogContent>
      <DialogActions>
        <Button variant="text" disabled={busy} onClick={onClose}>
          {t('common.close')}
        </Button>
        <Button variant="contained" disabled={busy} onClick={onConfirm}>
          {t(busy ? 'common.saving' : 'platform.confirmExecution')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
function RunList({ items, request, onRefresh }) {
  const dialogs = useUiDialog();
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  const cancel = async (id) => {
    setPending(true);
    try {
      await request(`/jobs/${id}/cancel`, { method: 'POST', body: {} });
      onRefresh();
    } catch (error) {
      setError(error);
    } finally {
      setPending(false);
    }
  };

  const resolve = async (job) => {
    const note = await dialogs.prompt({
      title: t('jobs.review'),
      message: t('jobs.reviewNote'),
      label: t('jobs.reviewNote'),
      required: true,
      multiline: true,
      confirmLabel: t('platform.confirmExecution'),
      cancelLabel: t('common.close'),
    });
    if (!note?.trim()) return;

    let messageId = '';
    if (job.snapshot?.channelId) {
      messageId = await dialogs.prompt({
        title: t('jobs.review'),
        message: t('jobs.recoveredMessage'),
        label: t('jobs.recoveredMessage'),
        confirmLabel: t('platform.confirmExecution'),
        cancelLabel: t('common.close'),
      });
      if (messageId === null) return;
    }

    setPending(true);
    try {
      await request(`/jobs/${job.id}/resolve`, {
        method: 'POST',
        body: { note, messageId: messageId || '' },
      });
      onRefresh();
    } catch (error) {
      setError(error);
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <PlatformErrorView error={error} />
      {items.length ? (
        <TableContainer
          component={Paper}
          variant="outlined"
          className="platform-table-wrap mui-table-surface"
        >
          <Table size="small" className="platform-table">
            <TableHead>
              <TableRow>
                {['action', 'status', 'scheduled', 'result', 'actions'].map((key) => (
                  <TableCell key={key}>{t(`platform.${key}`)}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {items.map((job) => (
                <TableRow key={job.id} hover>
                  <TableCell>
                    <Stack spacing={0.25}>
                      <Typography variant="body2" fontWeight={700}>
                        {t(`action.${job.action}`)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {job.snapshot?.name ?? job.input?.reason ?? job.resourceId}
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Status value={job.status} />
                  </TableCell>
                  <TableCell>
                    <Stack spacing={0.25}>
                      <Typography variant="body2">{time(job.runAt)}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {time(job.finishedAt)}
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell sx={{ minWidth: 260 }}>
                    <Stack spacing={1}>
                      {job.error ? (
                        <Typography variant="body2" color="error.main">
                          {t(`error.${job.error}`)}
                        </Typography>
                      ) : job.result?.messageId ? (
                        <Button
                          component="a"
                          variant="text"
                          size="small"
                          href={`https://discord.com/channels/${job.guildId}/${job.result.channelId}/${job.result.messageId}`}
                          target="_blank"
                          rel="noreferrer"
                          sx={{ alignSelf: 'flex-start' }}
                        >
                          {t('platform.openMessage')}
                        </Button>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          {job.result?.skipped
                            ? t('platform.skipped')
                            : t('platform.notAvailable')}
                        </Typography>
                      )}
                      <Accordion disableGutters elevation={0} className="mui-inline-accordion">
                        <AccordionSummary>{t('platform.details')}</AccordionSummary>
                        <AccordionDetails>
                          <pre>
                            {JSON.stringify(
                              {
                                steps: job.steps,
                                result: job.result,
                                details: job.details,
                              },
                              null,
                              2,
                            )}
                          </pre>
                        </AccordionDetails>
                      </Accordion>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1}>
                      {job.status === 'queued' ? (
                        <Button
                          variant="outlined"
                          size="small"
                          disabled={pending}
                          onClick={() => cancel(job.id)}
                        >
                          {t('jobs.cancel')}
                        </Button>
                      ) : null}
                      {job.status === 'needs_review' ? (
                        <Button
                          variant="contained"
                          size="small"
                          disabled={pending}
                          onClick={() => resolve(job)}
                        >
                          {t('jobs.review')}
                        </Button>
                      ) : null}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Empty text="jobs.empty" />
      )}
    </>
  );
}

function ResourcePage({ kind, request, bootstrap, selectedId, onNavigate }) {
  const dialogs = useUiDialog();
  const { limits, resources } = bootstrap;
  const [listing, setListing] = useState({ items: [], nextCursor: null });
  const [query, setQuery] = useState(''); const [cursor, setCursor] = useState(null);
  const [document, setDocument] = useState(null); const [value, setValue] = useState(null);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null); const [notice, setNotice] = useState('');
  const [tab, setTab] = useState('configure'); const [preview, setPreview] = useState(null);
  const [history, setHistory] = useState({ items: [], nextCursor: null }); const [runs, setRuns] = useState({ items: [], nextCursor: null });
  const [forms, setForms] = useState([]); const [threads, setThreads] = useState([]);
  const [sample, setSample] = useState({ content: '', event: 'message', roleIds: [], isBot: false, isWebhook: false, isAdministrator: false, accountAgeDays: 0, membershipAgeDays: 0, warnings: 0 });
  const [simulation, setSimulation] = useState(null);
  const dirty = value !== null && JSON.stringify(value) !== JSON.stringify(document?.draft ?? emptyResource(kind, limits));
  useUnsaved(dirty);
  const endpoint = `/resources/${kind}`;
  const load = useCallback(async () => {
    setLoading(true);
    try { const result = await request(`${endpoint}?q=${encodeURIComponent(query)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`); setListing(result); }
    catch (error) { setError(error); } finally { setLoading(false); }
  }, [request, endpoint, query, cursor]);
  useEffect(() => { const timer = setTimeout(load, query ? limits.searchDebounceMs : 0); return () => clearTimeout(timer); }, [load, limits.searchDebounceMs, query]);
  const open = useCallback(async id => {
    setBusy(true); setError(null); setNotice('');
    try { const result = await request(`${endpoint}/${id}`); setDocument(result.resource); setValue(structuredClone(result.resource.draft)); setTab('configure'); }
    catch (error) { setError(error); } finally { setBusy(false); }
  }, [request, endpoint]);
  useEffect(() => { if (selectedId) open(selectedId); }, [selectedId, open]);
  useEffect(() => { if (kind === 'ticket-panels') request('/resources/forms').then(result => setForms(result.items)).catch(setError); }, [request, kind]);
  const refreshRuns = useCallback(async (nextCursor) => {
    if (!document?.id) return;
    try { setRuns(await request(`${endpoint}/${document.id}/runs${nextCursor ? `?cursor=${encodeURIComponent(nextCursor)}` : ''}`)); } catch (error) { setError(error); }
  }, [request, endpoint, document?.id]);
  useEffect(() => {
    if (!document?.id || !['history', 'activity'].includes(tab)) return;
    if (tab === 'history') request(`${endpoint}/${document.id}/history`).then(setHistory).catch(setError);
    else refreshRuns();
  }, [request, endpoint, document?.id, tab, refreshRuns]);
  useEffect(() => {
    if (tab !== 'activity' || !runs.items.some(job => ['queued', 'running'].includes(job.status))) return undefined;
    const timer = setTimeout(() => { refreshRuns(); request(`${endpoint}/${document.id}`).then(result => setDocument(result.resource)).catch(setError); }, limits.workerPollMs);
    return () => clearTimeout(timer);
  }, [tab, runs, refreshRuns, request, endpoint, document?.id, limits.workerPollMs]);
  const run = async operation => { setBusy(true); setError(null); try { return await operation(); } catch (error) { setError(error); } finally { setBusy(false); } };
  const save = () => run(async () => {
    const result = document?.id ? await request(`${endpoint}/${document.id}`, { method: 'PUT', body: { revision: document.revision, value } }) : await request(endpoint, { method: 'POST', body: value });
    setDocument(result.resource); setValue(structuredClone(result.resource.draft)); setNotice(t('platform.draftSaved')); load(); return result.resource;
  });
  const start = async () => {
    if (
      dirty &&
      !(await dialogs.confirm({
        title: t('platform.unsavedTitle'),
        message: t('platform.unsavedConfirm'),
        confirmLabel: t('platform.leaveAnyway'),
        cancelLabel: t('platform.keepEditing'),
      }))
    ) {
      return;
    }
    setDocument(null);
    setValue(emptyResource(kind, limits));
    setTab('configure');
    setError(null);
    setNotice('');
  };

  const openSafely = async (id) => {
    if (
      dirty &&
      !(await dialogs.confirm({
        title: t('platform.unsavedTitle'),
        message: t('platform.unsavedConfirm'),
        confirmLabel: t('platform.leaveAnyway'),
        cancelLabel: t('platform.keepEditing'),
      }))
    ) {
      return;
    }
    open(id);
  };
  const removeResource = async (item) => {
    if (item.live?.enabled || item.pendingJobId) return;
    const confirmed = await dialogs.confirm({
      title: t('platform.deleteResourceTitle', { name: item.draft.name }),
      message: t('platform.deleteResourceBody'),
      confirmLabel: t('platform.delete'),
      cancelLabel: t('common.cancel'),
    });
    if (!confirmed) return;

    await run(async () => {
      await request(`${endpoint}/${item.id}`, {
        method: 'DELETE',
        body: { revision: item.revision },
      });
      if (document?.id === item.id) {
        setDocument(null);
        setValue(null);
        setHistory({ items: [], nextCursor: null });
        setRuns({ items: [], nextCursor: null });
        setTab('configure');
      }
      setNotice(t('platform.deleted'));
      await load();
    });
  };
  const publish = action => run(async () => { setPreview(await request(`${endpoint}/${document.id}/preview`, { method: 'POST', body: { revision: document.revision, action } })); });
  const activeValue = document?.live?.revision === document?.revision ? 'published' : document?.live ? 'changed' : 'draft';
  const showMessage = FEATURES[kind].publish === 'message' || ['commands', 'feeds'].includes(kind);
  const configuredFields = Object.entries(FEATURES[kind].fields);
  return <section className="platform-module">
    <div className="platform-section-heading"><div><h2>{t(`feature.${kind}.title`)}</h2><p>{t(`feature.${kind}.description`)}</p></div><Button type="button" className="button primary" onClick={start}>{t('platform.create')}</Button></div>
    <PlatformErrorView error={error} />{notice && <p role="status" className="platform-notice">{notice}</p>}
    <div className="platform-resource-layout">
      <aside className="platform-resource-index">
        <TextField
          className="platform-search"
          type="search"
          size="small"
          fullWidth
          aria-label={t('platform.search')}
          placeholder={t('platform.search')}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setCursor(null);
          }}
        />
        {loading ? (
          <Busy />
        ) : listing.items.length ? (
          <div className="platform-resource-list">
            {listing.items.map((item) => {
              const deletionBlocked = item.live?.enabled || item.pendingJobId;
              const deleteHint = item.pendingJobId
                ? t('platform.deleteResourceBusy')
                : item.live?.enabled
                  ? t('platform.deleteResourceActive')
                  : t('platform.delete');

              return (
                <div className="platform-resource-item" key={item.id}>
                  <Button
                    className="platform-resource-open"
                    type="button"
                    aria-pressed={document?.id === item.id}
                    onClick={() => openSafely(item.id)}
                  >
                    <strong>{item.draft.name}</strong>
                    <span>
                      <Status
                        value={
                          item.live?.enabled
                            ? item.live.revision === item.revision
                              ? 'published'
                              : 'changed'
                            : 'draft'
                        }
                      />
                      <small>
                        {t('platform.versionShort', { version: item.revision })}
                      </small>
                    </span>
                  </Button>
                  <Tooltip title={deleteHint}>
                    <span className="platform-resource-delete-wrap">
                      <IconButton
                        className="platform-resource-delete"
                        size="small"
                        aria-label={t('platform.deleteResourceTitle', {
                          name: item.draft.name,
                        })}
                        disabled={busy || deletionBlocked}
                        onClick={() => removeResource(item)}
                      >
                        <Icon name="trash" size={16} />
                      </IconButton>
                    </span>
                  </Tooltip>
                </div>
              );
            })}
          </div>
        ) : (
          <Empty text="platform.noResources" />
        )}
        <Pager cursor={listing.nextCursor} onNext={setCursor} onFirst={() => setCursor(null)} busy={loading} />
      </aside>
      <div className="platform-resource-editor">
        {!value ? <Empty text="platform.startEditing"><Button type="button" className="button secondary" onClick={start}>{t('platform.create')}</Button></Empty> : <>
          <div className="platform-editor-toolbar"><Status value={activeValue} />{document?.id && <span className="muted">{t('platform.versionShort', { version: document.revision })}</span>}{dirty && <strong className="warning-text">{t('platform.unsaved')}</strong>}
            <div className="platform-actions"><Button type="button" className="button primary" disabled={busy || (!dirty && !!document)} onClick={save}>{t('platform.saveDraft')}</Button><Button type="button" className="button secondary" disabled={busy || !dirty} onClick={() => setValue(structuredClone(document?.draft ?? emptyResource(kind, limits)))}>{t('platform.discard')}</Button>{document && <Button type="button" className="button secondary" disabled={busy} onClick={() => run(async () => { const result = await request(endpoint, { method: 'POST', body: { ...value, name: t('platform.copyName', { name: value.name }) } }); setDocument(result.resource); setValue(result.resource.draft); load(); })}>{t('platform.duplicate')}</Button>}</div>
          </div>
          <div className="platform-tabs" role="tablist" aria-label={t('platform.resourceTabs')}>{['configure', ...(showMessage ? ['message'] : []), ...(['automod-rules', 'workflows', 'commands'].includes(kind) ? ['test'] : []), 'history', 'activity'].map(item => <Button key={item} type="button" role="tab" aria-selected={tab === item} disabled={['history', 'activity', 'test'].includes(item) && !document} onClick={() => setTab(item)}>{t(`platform.tab.${item}`)}</Button>)}</div>
          {tab === 'configure' && (
        <div className="platform-configuration">
          <div className="platform-form-grid">
            <label className="platform-field mui-platform-field">
              <span>{t('platform.name')}</span>
              <TextField
                fullWidth
                value={value.name}
                inputProps={{ maxLength: limits.maximumNameLength }}
                onChange={(event) => setValue({ ...value, name: event.target.value })}
              />
            </label>
            <label className="platform-field mui-platform-field">
              <span>{t('platform.description')}</span>
              <TextField
                fullWidth
                multiline
                minRows={2}
                value={value.description}
                inputProps={{ maxLength: limits.maximumDescriptionLength }}
                onChange={(event) =>
                  setValue({ ...value, description: event.target.value })
                }
              />
            </label>
          </div>
            {showMessage && kind !== 'commands' && <div className="platform-destination"><strong>{resources.guild.name}</strong><SchemaField name="channelId" spec={{ type: 'channel', required: true }} value={value.channelId} onChange={channelId => { setValue({ ...value, channelId }); setThreads([]); request(`/threads?channelId=${channelId}`).then(result => setThreads(result.items)).catch(setError); }} resources={resources} limits={limits} />{!!threads.length && (
          <label className="platform-field mui-platform-field">
            <span>{t('platform.thread')}</span>
            <FormControl size="small" fullWidth>
              <MuiSelect
                displayEmpty
                value=""
                onChange={(event) =>
                  event.target.value &&
                  setValue({ ...value, channelId: event.target.value })
                }
              >
                <MenuItem value="">{t('platform.choose')}</MenuItem>
                {threads.map((thread) => (
                  <MenuItem key={thread.id} value={thread.id}>
                    {thread.name}
                  </MenuItem>
                ))}
              </MuiSelect>
            </FormControl>
          </label>
        )}
        <Accordion
          disableGutters
          elevation={0}
          className="mui-inline-accordion mui-form-accordion"
        >
          <AccordionSummary>{t('platform.advancedDestination')}</AccordionSummary>
          <AccordionDetails>
            <label className="platform-field mui-platform-field">
              <span>{label('channelId')}</span>
              <TextField
                fullWidth
                value={value.channelId}
                onChange={(event) =>
                  setValue({ ...value, channelId: event.target.value })
                }
              />
            </label>
          </AccordionDetails>
        </Accordion>
      </div>}
            <div className="platform-config-fields">{configuredFields.map(([key, spec]) => <SchemaField key={key} name={key} spec={spec} value={value.config[key]} onChange={next => setValue({ ...value, config: { ...value.config, [key]: next } })} resources={resources} limits={limits} forms={forms} />)}</div>
          </div>
          )}
          {tab === 'message' && <><p className="muted">{t(kind === 'rules' ? 'rules.messageHelp' : 'platform.messageHelp')}</p>{listing.items.length > 1 && (
          <label className="platform-field mui-platform-field">
            <span>{t('studio.useTemplate')}</span>
            <FormControl size="small" fullWidth>
              <MuiSelect
                displayEmpty
                value=""
                onChange={(event) => {
                  const template = listing.items.find(
                    (item) => item.id === event.target.value,
                  );
                  if (template) {
                    setValue({
                      ...value,
                      message: structuredClone(template.draft.message),
                    });
                  }
                }}
              >
                <MenuItem value="">{t('platform.choose')}</MenuItem>
                {listing.items
                  .filter((item) => item.id !== document?.id)
                  .map((item) => (
                    <MenuItem key={item.id} value={item.id}>
                      {item.draft.name}
                    </MenuItem>
                  ))}
              </MuiSelect>
            </FormControl>
          </label>
        )}<MessageStudio value={value.message} onChange={message => setValue({ ...value, message })} resources={resources} limits={limits} /></>}
          {tab === 'test' && <div className="platform-test"><p>{t('platform.simulatorHelp')}</p><div className="platform-form-grid">{Object.entries({ content: { type: 'text', multiline: true }, event: { type: 'select', options: ['message', 'member_join', 'member_leave', 'role_add', 'role_remove', 'rules_accepted', 'interval', 'command'] }, roleIds: { type: 'roles' }, channelId: { type: 'channel' }, accountAgeDays: { type: 'number' }, membershipAgeDays: { type: 'number' }, warnings: { type: 'number' }, recentMessageCount: { type: 'number' }, duplicateCount: { type: 'number' }, attachmentCount: { type: 'number' }, isBot: { type: 'boolean' }, isWebhook: { type: 'boolean' }, isAdministrator: { type: 'boolean' }, username: { type: 'text' }, commandName: { type: 'text' } }).map(([key, spec]) => <SchemaField key={key} name={key} spec={spec} value={sample[key]} onChange={next => setSample({ ...sample, [key]: next })} resources={resources} limits={limits} />)}</div><Button type="button" className="button primary" disabled={busy || dirty} onClick={() => run(async () => setSimulation(await request(`${endpoint}/${document.id}/simulate`, { method: 'POST', body: { context: sample } })))}>{t('platform.runTest')}</Button>{simulation && <><h3>{t(simulation.triggered ? 'platform.wouldTrigger' : 'platform.wouldNotTrigger')}</h3><ul className="platform-trace">{simulation.trace.map((trace, index) => <li key={index} className={trace.passed ? 'passed' : 'failed'}><strong>{t(`trace.${trace.code}`, { field: label(trace.field ?? ''), expected: trace.expected ?? trace.value ?? '', actual: textValue(trace.actual) })}</strong><span>{t(trace.passed ? 'platform.passed' : 'platform.notPassed')}</span></li>)}</ul></>}</div>}
          {tab === 'history' && <><p className="muted">{t('platform.rollbackHelp')}</p>{history.items.map(version => <article className="platform-version" key={version.id}><div className="studio-section-heading"><strong>{t('platform.versionShort', { version: version.revision })}</strong><span>{version.actorId} · {time(version.at)}</span><Button type="button" className="button secondary" disabled={busy || dirty || version.revision === document.revision} onClick={() => run(async () => { const result = await request(`${endpoint}/${document.id}/rollback`, { method: 'POST', body: { revision: document.revision, targetRevision: version.revision } }); setDocument(result.resource); setValue(result.resource.draft); setNotice(t('platform.restoredDraft')); load(); })}>{t('platform.restoreDraft')}</Button></div><ChangeList changes={version.changes} /></article>)}<Pager cursor={history.nextCursor} onNext={cursor => run(async () => setHistory(await request(`${endpoint}/${document.id}/history?cursor=${cursor}`)))} onFirst={() => run(async () => setHistory(await request(`${endpoint}/${document.id}/history`)))} busy={busy} /></>}
          {tab === 'activity' && <><div className="platform-actions"><Button type="button" className="button secondary" onClick={() => refreshRuns()}>{t('platform.refresh')}</Button><Button type="button" className="button secondary" onClick={() => onNavigate(kind === 'ticket-panels' ? 'tickets' : 'activity')}>{t('platform.allActivity')}</Button></div><RunList items={runs.items} request={request} onRefresh={refreshRuns} /><Pager cursor={runs.nextCursor} onNext={refreshRuns} onFirst={() => refreshRuns()} busy={busy} /></>}
          <footer className="platform-publish-bar"><p>{document?.pendingJobId ? t('platform.jobPending') : dirty ? t('platform.saveBeforePublish') : t('platform.publishHelp')}</p><div className="platform-actions">
            <Button type="button" className="button primary" disabled={!document || dirty || busy || !!document.pendingJobId} onClick={() => publish('publish')}>{t(document?.publication?.references?.length ? 'platform.updateDiscord' : FEATURES[kind].publish === 'runtime' ? 'platform.enable' : 'platform.previewPublish')}</Button>
            {FEATURES[kind].publish === 'message' && <Button type="button" className="button secondary" disabled={!document || dirty || busy || !!document.pendingJobId} onClick={() => publish('test')}>{t('platform.sendTest')}</Button>}
            {document?.live && <><Button type="button" className="button secondary" disabled={busy || dirty || !!document.pendingJobId} onClick={() => publish('pause')}>{t('platform.pause')}</Button>{FEATURES[kind].publish === 'message' && <><Button type="button" className="button secondary" disabled={busy || dirty || !!document.pendingJobId} onClick={() => publish('republish')}>{t('platform.republish')}</Button><Button type="button" className="button secondary" disabled={busy || dirty || !!document.pendingJobId} onClick={() => publish('unpublish')}>{t('platform.unpublish')}</Button></>}</>}
          </div></footer>
        </>}
      </div>
    </div>
    {preview && <ImpactDialog preview={preview} resources={resources} busy={busy} onClose={() => setPreview(null)} onConfirm={() => run(async () => { await request('/execute', { method: 'POST', body: { token: preview.token } }); setPreview(null); setNotice(t('platform.queued')); const result = await request(`${endpoint}/${document.id}`); setDocument(result.resource); setTab('activity'); refreshRuns(); load(); })} />}
  </section>;
}

function CommandCenter({ request, bootstrap, onNavigate }) {
  const { limits, resources } = bootstrap;
  const [range, setRange] = useState(String(limits.defaultRangeDays));
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [data, setData] = useState(null); const [health, setHealth] = useState(null); const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (range === 'custom' && (!from || !to)) return;
    setBusy(true);
    const end = range === 'custom' ? new Date(to).toISOString() : new Date().toISOString();
    const start = range === 'custom' ? new Date(from).toISOString() : new Date(Date.now() - Number(range) * 86400000).toISOString();
    try { const [overview, health] = await Promise.all([request(`/overview?from=${encodeURIComponent(start)}&to=${encodeURIComponent(end)}`), request('/health')]); setData(overview); setHealth(health); setError(null); }
    catch (error) { setError(error); } finally { setBusy(false); }
  }, [request, range, from, to]);
  useEffect(() => { load(); }, [load]);
  return <section className="platform-module"><div className="platform-section-heading"><div><h2>{t('center.title')}</h2><p>{t('center.description')}</p></div><div className="platform-actions">
        <FormControl size="small" sx={{ minWidth: 170 }}>
          <MuiSelect
            aria-label={t('center.dateRange')}
            value={range}
            onChange={(event) => setRange(event.target.value)}
          >
            {limits.dateRangeDays.map((days) => (
              <MenuItem key={days} value={String(days)}>
                {t('center.days', { count: days })}
              </MenuItem>
            ))}
            <MenuItem value="custom">{t('center.custom')}</MenuItem>
          </MuiSelect>
        </FormControl>
        {range === 'custom' ? (
          <>
            <TextField
              aria-label={t('center.from')}
              type="datetime-local"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
            <TextField
              aria-label={t('center.to')}
              type="datetime-local"
              value={to}
              onChange={(event) => setTo(event.target.value)}
            />
          </>
        ) : null}
        <Button variant="outlined" disabled={busy} onClick={load}>
          {t('platform.refresh')}
        </Button>
      </div></div>
    <PlatformErrorView error={error} />{!data ? <Busy /> : <>
      <div className="center-metrics"><article><span>{t('center.members')}</span><strong>{resources.guild.memberCount?.toLocaleString() ?? t('platform.notAvailable')}</strong><small>{t('center.online', { count: resources.guild.onlineCount?.toLocaleString() ?? t('platform.notAvailable') })}</small></article>{['messages', 'joins', 'leaves', 'automod', 'warnings'].map(key => <article key={key}><span>{t(`center.${key}`)}</span><strong>{data.current[key].toLocaleString()}</strong><small>{t('center.previous', { count: data.previous[key].toLocaleString(), change: data.current[key] - data.previous[key] })}</small></article>)}</div>
      <p className="muted">{t('center.collectionHelp')}</p>
      <div className="center-operations"><Button type="button" onClick={() => onNavigate('moderation')}><span>{t('center.cases')}</span><strong>{data.cases}</strong></Button><Button type="button" onClick={() => onNavigate('tickets')}><span>{t('center.openTickets')}</span><strong>{data.openTickets}</strong></Button><Button type="button" onClick={() => onNavigate('jobs')}><span>{t('center.queued')}</span><strong>{data.jobs.queued ?? 0}</strong></Button><Button type="button" onClick={() => onNavigate('jobs')}><span>{t('center.failed')}</span><strong>{(data.jobs.failed ?? 0) + (data.jobs.needs_review ?? 0)}</strong></Button><div><span>{t('center.gateway')}</span><Status value={data.worker.online ? 'online' : 'offline'} /><small>{time(data.worker.lastSeen)}</small></div></div>
      {!!data.trend.length && <div className="center-trend"><h3>{t('center.messageTrend')}</h3><div role="img" aria-label={t('center.messageTrend')} className="center-bars">{data.trend.map(point => <div key={point.at} title={t('center.trendPoint', { time: time(point.at), count: point.messages ?? 0 })} style={{ height: `${Math.max(1, ((point.messages ?? 0) / Math.max(1, ...data.trend.map(point => point.messages ?? 0))) * 100)}%` }} />)}</div></div>}
      <div className="platform-section-heading"><h3>{t('center.quickActions')}</h3></div><div className="center-quick-actions">{Object.entries(pageKinds).filter(([, kind]) => bootstrap.features.includes(kind)).map(([page, kind]) => <Button className="button secondary" type="button" key={kind} onClick={() => onNavigate(page)}>{t(`feature.${kind}.title`)}</Button>)}</div>
      <div className="center-bottom"><section><h3>{t('center.setupHealth')}</h3>{!health ? <Busy /> : !health.issues.length ? <p className="platform-notice">{t('center.healthy')}</p> : <ul className="center-health">{health.issues.map((issue, index) => <li key={index}><div><strong>{t(`health.${issue.code}`)}</strong><small>{issue.name ?? issue.permission ?? issue.path}{issue.objectId ? ` · ${issue.objectId}` : ''}</small></div><Button type="button" className="button secondary" onClick={() => onNavigate(Object.entries(pageKinds).find(([, kind]) => kind === issue.kind)?.[0] ?? issue.page, issue.resourceId)}>{t('center.fix')}</Button></li>)}</ul>}</section><section><h3>{t('center.activity')}</h3>{data.activity.length ? <ol className="center-timeline">{data.activity.map(entry => <li key={entry.id}><strong>{t(`event.${entry.event}`)}</strong><span>{entry.actorId ?? t('center.system')}</span><time>{time(entry.at)}</time></li>)}</ol> : <Empty text="center.noActivity" />}</section></div>
    </>}
  </section>;
}

function Records({ table, request, bootstrap }) {
  const dialogs = useUiDialog();
  const [data, setData] = useState({ items: [], nextCursor: null }); const [query, setQuery] = useState(''); const [status, setStatus] = useState(''); const [cursor, setCursor] = useState(null);
  const [error, setError] = useState(null); const [busy, setBusy] = useState(false); const [transcript, setTranscript] = useState(null);
  const statuses = table === 'tickets' ? ['open', 'pending', 'closed', 'needs_review'] : table === 'submissions' ? ['pending', 'accepted', 'rejected', 'archived'] : table === 'jobs' ? ['queued', 'running', 'completed', 'failed', 'needs_review', 'cancelled', 'reviewed'] : [];
  const load = useCallback(async () => {
    setBusy(true); try { setData(await request(`/records/${table}?q=${encodeURIComponent(query)}&status=${encodeURIComponent(status)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)); setError(null); } catch (error) { setError(error); } finally { setBusy(false); }
  }, [request, table, query, status, cursor]);
  useEffect(() => { const timeout = setTimeout(load, query ? bootstrap.limits.searchDebounceMs : 0); return () => clearTimeout(timeout); }, [load, bootstrap.limits.searchDebounceMs, query]);
  const act = async (path, body, method = 'POST') => { setBusy(true); try { await request(path, { method, body }); await load(); } catch (error) { setError(error); } finally { setBusy(false); } };
  const ticketAction = async (entry, action) => {
    if (
      action === 'close' &&
      !(await dialogs.confirm({
        title: t('tickets.close'),
        message: t('tickets.closeImpact'),
        confirmLabel: t('tickets.close'),
        cancelLabel: t('common.close'),
      }))
    ) {
      return;
    }
    await act(`/tickets/${entry.id}/actions`, { action });
  };
  const addTicketNote = async (entry) => {
    const text = await dialogs.prompt({
      title: t('tickets.addNote'),
      message: t('tickets.notePrompt'),
      label: t('tickets.notePrompt'),
      multiline: true,
      required: true,
      confirmLabel: t('tickets.addNote'),
      cancelLabel: t('common.close'),
    });
    if (text?.trim()) {
      await act(`/tickets/${entry.id}/actions`, { action: 'note', text });
    }
  };
  return <section className="platform-module"><div className="platform-section-heading"><div><h2>{t(`records.${table}`)}</h2><p>{t(`records.${table}.help`)}</p></div><Button type="button" className="button secondary" onClick={load} disabled={busy}>{t('platform.refresh')}</Button></div><PlatformErrorView error={error} />
    <div className="platform-filterbar">
      <TextField
        type="search"
        size="small"
        aria-label={t('platform.search')}
        placeholder={t('platform.search')}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setCursor(null);
        }}
      />
      {statuses.length ? (
        <FormControl size="small" sx={{ minWidth: 190 }}>
          <MuiSelect
            displayEmpty
            aria-label={t('platform.status')}
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setCursor(null);
            }}
          >
            <MenuItem value="">{t('platform.allStatuses')}</MenuItem>
            {statuses.map((statusValue) => (
              <MenuItem key={statusValue} value={statusValue}>
                {t(`status.${statusValue}`)}
              </MenuItem>
            ))}
          </MuiSelect>
        </FormControl>
      ) : null}
    </div>
    {busy && !data.items.length ? <Busy /> : table === 'jobs' ? <RunList items={data.items} request={request} onRefresh={load} /> : !data.items.length ? <Empty /> : <div className="platform-record-list">{data.items.map(entry => <article key={entry.id} className="platform-record"><div className="platform-record-heading"><strong>{entry.event ? t(`event.${entry.event}`) : entry.userId ?? entry.resourceId}</strong>{entry.status && <Status value={entry.status} />}<time>{time(entry.at)}</time></div>
      {entry.actorId && <p className="muted">{t('platform.actorValue', { actor: entry.actorId })}</p>}
      {entry.details?.changes ? <ChangeList changes={entry.details.changes} /> : entry.details && <pre>{JSON.stringify(entry.details, null, 2)}</pre>}
      {entry.answers && <dl className="platform-answers">{entry.answers.map((answer, index) => <div key={index}><dt>{answer.label}</dt><dd>{answer.value}</dd></div>)}</dl>}
      {table === 'submissions' && <div className="platform-actions">{statuses.filter(status => status !== entry.status).map(status => <Button key={status} type="button" className="button secondary" disabled={busy} onClick={() => act(`/submissions/${entry.id}`, { status }, 'PATCH')}>{t(`status.${status}`)}</Button>)}</div>}
      {table === 'tickets' && <><p>{t('tickets.assignee', { user: entry.assigneeId ?? t('tickets.unassigned') })}</p><div className="platform-actions">{entry.channelId && (
          <Button
            component="a"
            variant="outlined"
            href={`https://discord.com/channels/${entry.guildId}/${entry.channelId}`}
            target="_blank"
            rel="noreferrer"
          >
            {t('tickets.openChannel')}
          </Button>
        )}{['claim', entry.status === 'closed' ? 'reopen' : 'close'].map(action => <Button key={action} type="button" className="button secondary" disabled={busy} onClick={() => ticketAction(entry, action)}>{t(`tickets.${action}`)}</Button>)}<Button type="button" className="button secondary" disabled={busy} onClick={() => addTicketNote(entry)}>{t('tickets.addNote')}</Button>{entry.status === 'closed' && <Button type="button" className="button secondary" onClick={() => request(`/tickets/${entry.id}/transcript`).then(result => setTranscript(result.transcript)).catch(setError)}>{t('tickets.transcript')}</Button>}</div>{entry.notes?.map((note, index) => <p key={index}>{note.text}<small>{note.actorId} · {time(note.at)}</small></p>)}</>}
    </article>)}</div>}
    <Pager cursor={data.nextCursor} onNext={setCursor} onFirst={() => setCursor(null)} busy={busy} />
    {transcript && <section className="platform-transcript"><div className="platform-section-heading"><h3>{t('tickets.transcript')}</h3><Button type="button" className="button secondary" onClick={() => downloadJson(transcript, `transcript-${transcript.id}`)}>{t('studio.export')}</Button><Button type="button" className="button secondary" onClick={() => setTranscript(null)}>{t('common.close')}</Button></div>{transcript.capped && <p>{t('tickets.transcriptCapped')}</p>}{transcript.messages.map(message => <article key={message.id}><strong>{message.authorName ?? message.authorId}</strong><time>{time(message.at)}</time><p>{message.content}</p></article>)}</section>}
  </section>;
}

function Moderation({ request, bootstrap, membersOnly = false }) {
  const dialogs = useUiDialog();
  const [query, setQuery] = useState(''); const [members, setMembers] = useState([]); const [profile, setProfile] = useState(null);
  const [cases, setCases] = useState({ items: [], nextCursor: null }); const [error, setError] = useState(null); const [busy, setBusy] = useState(false); const [preview, setPreview] = useState(null); const [notice, setNotice] = useState('');
  const [input, setInput] = useState({ type: 'warn', targetIds: [], reason: '', durationSeconds: 0, points: 1 });
  const loadCases = useCallback(async cursor => { try { setCases(await request(`/cases${cursor ? `?cursor=${cursor}` : ''}`)); } catch (error) { setError(error); } }, [request]);
  useEffect(() => { if (!membersOnly) loadCases(); }, [loadCases, membersOnly]);
  useEffect(() => {
    if (!query.trim()) { setMembers([]); return; }
    let current = true; const timer = setTimeout(() => request(`/members?q=${encodeURIComponent(query)}`).then(result => { if (current) setMembers(result.items); }).catch(error => { if (current) setError(error); }), bootstrap.limits.searchDebounceMs);
    return () => { current = false; clearTimeout(timer); };
  }, [request, query, bootstrap.limits.searchDebounceMs]);
  const run = async operation => { setBusy(true); setError(null); try { await operation(); } catch (error) { setError(error); } finally { setBusy(false); } };
  const editCaseReason = async (entry) => {
    const reason = await dialogs.prompt({
      title: t('cases.editReason'),
      label: t('cases.editReason'),
      defaultValue: entry.reason ?? '',
      required: true,
      multiline: true,
      confirmLabel: t('cases.editReason'),
      cancelLabel: t('common.close'),
    });
    if (!reason?.trim()) return;
    await run(async () => {
      await request(`/cases/${entry.id}`, {
        method: 'PATCH',
        body: { reason },
      });
      setNotice(t('platform.queued'));
      await loadCases();
    });
  };
  const addCaseNote = async (entry) => {
    const note = await dialogs.prompt({
      title: t('cases.addNote'),
      label: t('cases.addNote'),
      required: true,
      multiline: true,
      confirmLabel: t('cases.addNote'),
      cancelLabel: t('common.close'),
    });
    if (!note?.trim()) return;
    await run(async () => {
      await request(`/cases/${entry.id}`, {
        method: 'PATCH',
        body: { note },
      });
      setNotice(t('platform.queued'));
      await loadCases();
    });
  };
  return <section className="platform-module"><div className="platform-section-heading"><div><h2>{t(membersOnly ? 'members.title' : 'cases.title')}</h2><p>{t('cases.help')}</p></div><Button type="button" className="button secondary" onClick={() => loadCases()}>{t('platform.refresh')}</Button></div><PlatformErrorView error={error} />{notice && <p role="status" className="platform-notice">{notice}</p>}
    <label className="platform-field mui-platform-field">
      <span>{t('members.search')}</span>
      <TextField
        fullWidth
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('members.searchHelp')}
      />
    </label>
    {!!members.length && (
      <div className="platform-member-results">
        {members.map((member) => (
          <div key={member.id}>
            <FormControlLabel
              className="platform-check mui-platform-check"
              control={
                <Checkbox
                  checked={input.targetIds.includes(member.id)}
                  onChange={(event) =>
                    setInput({
                      ...input,
                      targetIds: event.target.checked
                        ? [...input.targetIds, member.id]
                        : input.targetIds.filter((id) => id !== member.id),
                    })
                  }
                />
              }
              label={
                <span className="mui-member-label">
                  <strong>{member.name}</strong>
                </span>
              }
            />
            <Button
              variant="outlined"
              onClick={() =>
                run(async () =>
                  setProfile(await request(`/members/${member.id}`)),
                )
              }
            >
              {t('members.profile')}
            </Button>
          </div>
        ))}
      </div>
    )}
    {!!input.targetIds.length && <p>{t('cases.selected', { count: input.targetIds.length })}<Button type="button" className="button secondary" onClick={() => setInput({ ...input, targetIds: [] })}>{t('cases.clearSelection')}</Button></p>}
    {!membersOnly && <div className="platform-moderation-form"><div className="platform-form-grid"><SchemaField name="type" spec={{ type: 'select', options: ['warn', 'note', 'timeout', 'untimeout', 'kick', 'ban', 'unban'] }} value={input.type} onChange={type => setInput({ ...input, type })} resources={bootstrap.resources} limits={bootstrap.limits} /><SchemaField name="reason" spec={{ type: 'text', required: true, multiline: true }} value={input.reason} onChange={reason => setInput({ ...input, reason })} resources={bootstrap.resources} limits={bootstrap.limits} />{['timeout', 'ban'].includes(input.type) && <SchemaField name="durationSeconds" spec={{ type: 'number', min: 0 }} value={input.durationSeconds} onChange={durationSeconds => setInput({ ...input, durationSeconds })} resources={bootstrap.resources} limits={bootstrap.limits} />}{input.type === 'warn' && <SchemaField name="points" spec={{ type: 'number', min: 1 }} value={input.points} onChange={points => setInput({ ...input, points })} resources={bootstrap.resources} limits={bootstrap.limits} />}</div>
    <Button type="button" className="button primary" disabled={busy || !input.targetIds.length || !input.reason.trim()} onClick={() => run(async () => setPreview(await request('/moderation/preview', { method: 'POST', body: input })))}>{t('cases.previewAction')}</Button></div>}
    {profile && <section className="platform-profile"><div className="platform-section-heading"><h3>{profile.member.name}</h3><Button type="button" className="button secondary" onClick={() => setProfile(null)}>{t('common.close')}</Button></div><dl><dt>{t('members.created')}</dt><dd>{time(profile.member.accountCreatedAt)}</dd><dt>{t('members.joined')}</dt><dd>{time(profile.member.joinedAt)}</dd><dt>{t('members.roles')}</dt><dd>{profile.member.roles.map(id => bootstrap.resources.roles.find(role => role.id === id)?.name ?? t('platform.notAvailable')).join(', ')}</dd><dt>{t('members.timeout')}</dt><dd>{time(profile.member.timeoutUntil)}</dd><dt>{t('members.tickets')}</dt><dd>{profile.tickets.length}</dd></dl>{profile.cases.map(entry => <p key={entry.id}>{t('cases.caseNumber', { number: entry.id })} · {entry.action} · {entry.reason}</p>)}</section>}
    {!membersOnly && (
      <>
        {cases.items.length ? (
          <TableContainer
            component={Paper}
            variant="outlined"
            className="platform-table-wrap mui-table-surface"
          >
            <Table size="small" className="platform-table">
              <TableHead>
                <TableRow>
                  {['case', 'target', 'moderator', 'reason', 'date', 'actions'].map(
                    (key) => (
                      <TableCell key={key}>{t(`cases.${key}`)}</TableCell>
                    ),
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {cases.items.map((entry) => (
                  <TableRow key={entry.id} hover>
                    <TableCell>
                      <Stack spacing={0.75} alignItems="flex-start">
                        <Typography variant="subtitle2" fontWeight={800}>
                          #{entry.id}
                        </Typography>
                        <Chip
                          size="small"
                          label={choice(entry.action)}
                          variant="outlined"
                        />
                        <Status value={entry.status ?? 'active'} />
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="text"
                        size="small"
                        onClick={() =>
                          run(async () =>
                            setProfile(await request(`/members/${entry.targetId}`)),
                          )
                        }
                        sx={{ px: 0, justifyContent: 'flex-start' }}
                      >
                        {entry.targetTag ?? t('platform.notAvailable')}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {entry.actorTag ?? t('platform.notAvailable')}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Stack spacing={0.75}>
                        <Typography variant="body2">
                          {entry.reason || t('moderation.noReason')}
                        </Typography>
                        {entry.note ? (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ whiteSpace: 'pre-wrap' }}
                          >
                            {entry.note}
                          </Typography>
                        ) : null}
                        {entry.evidence ? (
                          <Accordion
                            disableGutters
                            elevation={0}
                            className="mui-inline-accordion"
                          >
                            <AccordionSummary>
                              <Typography variant="caption" fontWeight={700}>
                                {t('cases.evidence')}
                              </Typography>
                            </AccordionSummary>
                            <AccordionDetails>
                              <EvidenceDetails evidence={entry.evidence} />
                            </AccordionDetails>
                          </Accordion>
                        ) : null}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{time(entry.at)}</Typography>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Tooltip title={t('cases.editReason')}>
                          <span>
                            <Button
                              size="small"
                              variant="outlined"
                              disabled={busy}
                              onClick={() => editCaseReason(entry)}
                            >
                              {t('cases.editReason')}
                            </Button>
                          </span>
                        </Tooltip>
                        <Button
                          size="small"
                          variant="outlined"
                          disabled={busy}
                          onClick={() => addCaseNote(entry)}
                        >
                          {t('cases.addNote')}
                        </Button>
                        {['ban', 'timeout'].includes(entry.action) ? (
                          <Button
                            size="small"
                            variant="text"
                            color="warning"
                            onClick={() =>
                              setInput({
                                ...input,
                                type: entry.action === 'ban' ? 'unban' : 'untimeout',
                                targetIds: [entry.targetId],
                                reason: t('cases.reversalReason', { number: entry.id }),
                              })
                            }
                          >
                            {t('cases.reverse')}
                          </Button>
                        ) : null}
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Empty text="cases.empty" />
        )}
        <Pager
          cursor={cases.nextCursor}
          onNext={loadCases}
          onFirst={() => loadCases()}
          busy={busy}
        />
      </>
    )}
    {preview && <ImpactDialog preview={preview} resources={bootstrap.resources} busy={busy} onClose={() => setPreview(null)} onConfirm={() => run(async () => { await request('/moderation/execute', { method: 'POST', body: { token: preview.token } }); setPreview(null); setNotice(t('platform.queued')); })} />}
  </section>;
}

function Access({ request, bootstrap }) {
  const dialogs = useUiDialog();
  const [data, setData] = useState(null); const [saved, setSaved] = useState(null); const [error, setError] = useState(null); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('');
  useEffect(() => { request('/access').then(result => { setData(result); setSaved(result.policy); }).catch(setError); }, [request]);
  const dirty = !!data && JSON.stringify(data.policy) !== JSON.stringify(saved); useUnsaved(dirty);
  const update = policy => setData({ ...data, policy });
  const saveAccess = async () => {
    const confirmed = await dialogs.confirm({
      title: t('access.save'),
      message: t('access.impact'),
      confirmLabel: t('access.save'),
      cancelLabel: t('common.close'),
    });
    if (!confirmed) return;
    setBusy(true);
    try {
      await request('/access', {
        method: 'PUT',
        body: {
          grants: data.policy.grants,
          managerCapabilities: data.policy.managerCapabilities,
        },
      });
      setSaved(data.policy);
      setNotice(t('access.saved'));
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  };
  return <section className="platform-module"><h2>{t('access.title')}</h2><p>{t('access.help')}</p><PlatformErrorView error={error} />{notice && <p role="status">{notice}</p>}{!data ? <Busy /> : <>
    <Accordion
      disableGutters
      elevation={0}
      className="mui-inline-accordion mui-form-accordion"
    >
      <AccordionSummary>{t('access.managerDefaults')}</AccordionSummary>
      <AccordionDetails>
        <div className="access-capabilities">
          {data.capabilities.map((capability) => (
            <FormControlLabel
              className="platform-check mui-platform-check"
              key={capability}
              control={
                <Checkbox
                  checked={data.policy.managerCapabilities.includes(capability)}
                  onChange={(event) =>
                    update({
                      ...data.policy,
                      managerCapabilities: event.target.checked
                        ? [...data.policy.managerCapabilities, capability]
                        : data.policy.managerCapabilities.filter(
                            (key) => key !== capability,
                          ),
                    })
                  }
                />
              }
              label={t(`capability.${capability}`)}
            />
          ))}
        </div>
      </AccordionDetails>
    </Accordion>
    {data.policy.grants.map((grant, index) => <div className="platform-access-grant" key={index}><div className="platform-form-grid"><SchemaField name="roleId" spec={{ type: 'roles' }} value={grant.roleId ? [grant.roleId] : []} onChange={roles => update({ ...data.policy, grants: data.policy.grants.map((row, position) => position === index ? { roleId: roles.at(-1) ?? '', capabilities: row.capabilities } : row) })} resources={bootstrap.resources} limits={bootstrap.limits} /><label className="platform-field mui-platform-field">
        <span>{t('access.userId')}</span>
        <TextField
          fullWidth
          value={grant.userId ?? ''}
          onChange={(event) =>
            update({
              ...data.policy,
              grants: data.policy.grants.map((row, position) =>
                position === index
                  ? {
                      userId: event.target.value,
                      capabilities: row.capabilities,
                    }
                  : row,
              ),
            })
          }
        />
      </label>
      </div>
      <div className="access-capabilities">
        {data.capabilities.map((capability) => (
          <FormControlLabel
            key={capability}
            className="platform-check mui-platform-check"
            control={
              <Checkbox
                checked={grant.capabilities.includes(capability)}
                onChange={(event) =>
                  update({
                    ...data.policy,
                    grants: data.policy.grants.map((row, position) =>
                      position === index
                        ? {
                            ...row,
                            capabilities: event.target.checked
                              ? [...row.capabilities, capability]
                              : row.capabilities.filter(
                                  (key) => key !== capability,
                                ),
                          }
                        : row,
                    ),
                  })
                }
              />
            }
            label={t(`capability.${capability}`)}
          />
        ))}
      </div>
      <Button
        variant="outlined"
        onClick={() =>
          update({
            ...data.policy,
            grants: data.policy.grants.filter(
              (_, position) => position !== index,
            ),
          })
        }
      >
        {t('studio.remove')}
      </Button>
    </div>
  )}
    <div className="platform-actions"><Button type="button" className="button secondary" onClick={() => update({ ...data.policy, grants: [...data.policy.grants, { roleId: '', capabilities: [] }] })}>{t('access.addGrant')}</Button><Button type="button" className="button primary" disabled={!dirty || busy} onClick={saveAccess}>{t('access.save')}</Button></div><ChangeList changes={configurationDiff(saved, data.policy)} />
  </>}</section>;
}

function Blueprints({ request, bootstrap }) {
  const [blueprint, setBlueprint] = useState(null);
  const [mapping, setMapping] = useState({});
  const [kinds, setKinds] = useState([]);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const run = async (action) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  };

  const importBlueprint = (event) =>
    run(async () => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (file.size > bootstrap.limits.maximumImportBytes) {
        throw { code: 'IMPORT_TOO_LARGE' };
      }
      let parsed;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        throw { code: 'INVALID_INPUT' };
      }
      if (parsed.format !== 'sparkles-blueprint' || !Array.isArray(parsed.resources)) {
        throw { code: 'INVALID_INPUT' };
      }
      setBlueprint(parsed);
      setKinds(
        [...new Set(parsed.resources.map((item) => item.kind))].filter((kind) =>
          bootstrap.features.includes(kind),
        ),
      );
      setMapping({});
    });

  return (
    <section className="platform-module">
      <h2>{t('blueprints.title')}</h2>
      <p>{t('blueprints.help')}</p>
      <PlatformErrorView error={error} />
      {notice ? <p role="status">{notice}</p> : null}
      <div className="platform-actions">
        <Button
          variant="outlined"
          disabled={busy}
          onClick={() =>
            run(async () =>
              downloadJson(await request('/blueprint'), t('blueprints.filename')),
            )
          }
        >
          {t('blueprints.export')}
        </Button>
        <Button component="label" variant="outlined" disabled={busy}>
          {t('blueprints.import')}
          <input
            className="mui-visually-hidden"
            type="file"
            accept="application/json,.json"
            onChange={importBlueprint}
          />
        </Button>
      </div>

      {blueprint ? (
        <>
          <h3>{t('blueprints.modules')}</h3>
          <div className="platform-actions">
            {[...new Set(blueprint.resources.map((item) => item.kind))]
              .filter((kind) => FEATURES[kind])
              .map((kind) => (
                <FormControlLabel
                  className="platform-check mui-platform-check"
                  key={kind}
                  control={
                    <Checkbox
                      checked={kinds.includes(kind)}
                      disabled={!bootstrap.features.includes(kind)}
                      onChange={(event) =>
                        setKinds(
                          event.target.checked
                            ? [...kinds, kind]
                            : kinds.filter((value) => value !== kind),
                        )
                      }
                    />
                  }
                  label={t(`feature.${kind}.title`)}
                />
              ))}
          </div>

          <h3>{t('blueprints.mapping')}</h3>
          {['channels', 'categories', 'roles'].map((type) => (
            <div key={type}>
              {(blueprint[type] ?? []).map((source) => (
                <div className="platform-mapping" key={source.id}>
                  <span>
                    {source.name}
                    <small>{source.id}</small>
                  </span>
                  <span aria-hidden="true">→</span>
                  <FormControl size="small" fullWidth>
                    <MuiSelect
                      aria-label={t('blueprints.mapObject', { name: source.name })}
                      displayEmpty
                      value={mapping[source.id] ?? ''}
                      onChange={(event) =>
                        setMapping({
                          ...mapping,
                          [source.id]: event.target.value,
                        })
                      }
                    >
                      <MenuItem value="">{t('platform.choose')}</MenuItem>
                      {bootstrap.resources[type].map((target) => (
                        <MenuItem key={target.id} value={target.id}>
                          {target.name}
                        </MenuItem>
                      ))}
                    </MuiSelect>
                  </FormControl>
                </div>
              ))}
            </div>
          ))}

          <Button
            variant="contained"
            disabled={busy || !kinds.length}
            onClick={() =>
              run(async () =>
                setPreview(
                  await request('/blueprint/preview', {
                    method: 'POST',
                    body: {
                      blueprint,
                      mapping: Object.fromEntries(
                        Object.entries(mapping).filter(([, id]) => id),
                      ),
                      kinds,
                    },
                  }),
                ),
              )
            }
          >
            {t('blueprints.preview')}
          </Button>
        </>
      ) : null}

      {preview ? (
        <ImpactDialog
          preview={preview}
          resources={bootstrap.resources}
          busy={busy}
          onClose={() => setPreview(null)}
          onConfirm={() =>
            run(async () => {
              const result = await request('/blueprint/import', {
                method: 'POST',
                body: { token: preview.token },
              });
              setPreview(null);
              setBlueprint(null);
              setNotice(t('blueprints.imported', { count: result.items.length }));
            })
          }
        />
      ) : null}
    </section>
  );
}

export default function PlatformWorkspace({ page, guildId, session, onNavigate, selectedId, onSessionExpired }) {
  const [bootstrap, setBootstrap] = useState(null); const [error, setError] = useState(null); const [view, setView] = useState('builder');
  const request = useCallback(async (path, options = {}) => {
    try { return await api(`/api/guilds/${guildId}/platform${path}`, { ...options, csrfToken: session.csrfToken }); }
    catch (error) { if (['AUTH_REQUIRED', 'DISCORD_SESSION_EXPIRED', 'INVALID_CSRF'].includes(error.code)) onSessionExpired?.(error); throw error; }
  }, [guildId, session.csrfToken, onSessionExpired]);
  useEffect(() => { let current = true; request('/bootstrap').then(result => { if (current) setBootstrap(result); }).catch(error => { if (current) setError(error); }); return () => { current = false; }; }, [request]);
  const kind = pageKinds[page];
  return <div className="platform-workspace"><PlatformErrorView error={error} />{!bootstrap ? !error && <Busy /> : <>
    {['tickets', 'forms', 'rules'].includes(page) && <div className="platform-tabs">{['builder', 'records'].map(tab => <Button type="button" key={tab} aria-pressed={view === tab} onClick={() => setView(tab)}>{t(`platform.tab.${tab}`)}</Button>)}</div>}
    {kind && view === 'builder' && (bootstrap.features.includes(kind) ? <ResourcePage key={kind} kind={kind} request={request} bootstrap={bootstrap} selectedId={selectedId} onNavigate={onNavigate} /> : <Empty text="platform.noPermission" />)}
    {view === 'records' && <Records key={page} table={{ tickets: 'tickets', forms: 'submissions', rules: 'acceptances' }[page]} request={request} bootstrap={bootstrap} />}
    {page === 'overview' && (bootstrap.resources.capabilities.includes('view_analytics') ? <CommandCenter request={request} bootstrap={bootstrap} onNavigate={onNavigate} /> : <Empty text="platform.chooseAuthorizedModule" />)}
    {['moderation', 'members'].includes(page) && <Moderation request={request} bootstrap={bootstrap} membersOnly={page === 'members'} />}
    {['activity', 'jobs'].includes(page) && <Records table={page === 'jobs' ? 'jobs' : 'events'} request={request} bootstrap={bootstrap} />}
    {page === 'access' && <Access request={request} bootstrap={bootstrap} />}
    {page === 'blueprints' && <Blueprints request={request} bootstrap={bootstrap} />}
  </>}</div>;
}
