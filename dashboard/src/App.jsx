import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from './api.js';
import { t } from './i18n/index.js';
import Icon from './Icon.jsx';
import Select from './Select.jsx';
import EmbedBuilder, { EMPTY_EMBED } from './EmbedBuilder.jsx';
import EmojiPicker from './EmojiPicker.jsx';

const NAVIGATION = [
  ['overview', 'nav.overview', 'grid'],
  ['moderation', 'nav.moderation', 'shield'],
  ['automod', 'nav.automod', 'spark'],
  ['roles', 'nav.roles', 'users'],
  ['embeds', 'nav.embeds', 'message'],
  ['community', 'nav.community', 'message'],
  ['automation', 'nav.automation', 'refresh'],
  ['economy', 'nav.economy', 'coin'],
  ['music', 'nav.music', 'music'],
  ['modules', 'nav.modules', 'settings'],
  ['custom', 'nav.custom', 'terminal'],
];

const PAGE_IDS = new Set(NAVIGATION.map(([id]) => id));
const PAGE_DESCRIPTION_KEYS = {
  overview: 'overview.description',
  moderation: 'moderation.description',
  automod: 'automod.description',
  roles: 'roles.description',
  embeds: 'embeds.description',
  community: 'community.description',
  automation: 'automation.description',
  economy: 'economy.description',
  music: 'music.description',
  modules: 'modules.description',
  custom: 'custom.description',
};

function routeState() {
  const match = /^\/servers\/(\d{17,20})\/([a-z-]+)\/?$/u.exec(
    window.location.pathname,
  );
  return {
    guildId: match?.[1] ?? null,
    page: PAGE_IDS.has(match?.[2]) ? match[2] : 'overview',
  };
}

function dashboardPath(guildId, page) {
  return guildId ? `/servers/${guildId}/${PAGE_IDS.has(page) ? page : 'overview'}` : '/';
}

function emptyReactionForm() {
  return {
    messageLink: '',
    channelId: '',
    emoji: '👍',
    roleId: '',
    content: '',
    embed: structuredClone(EMPTY_EMBED),
  };
}

function emptyEmbedForm() {
  return {
    channelId: '',
    content: '',
    embed: structuredClone(EMPTY_EMBED),
  };
}

function translatedError(error) {
  if (!(error instanceof ApiError)) return t('error.client');

  const key = `error.${error.code}`;
  const variables = { reference: error.requestId };
  const value = t(key, variables);
  if (value !== key) {
    if (error.code === 'INTERNAL_ERROR' && !error.requestId) {
      return t('error.internalNoReference');
    }
    return value;
  }

  return error.requestId
    ? t('error.fallback', variables)
    : t('error.fallbackNoReference');
}

function rememberedGuild() {
  try {
    return window.localStorage.getItem('sparkles.selectedGuild');
  } catch {
    return null;
  }
}

function rememberGuild(guildId) {
  try {
    window.localStorage.setItem('sparkles.selectedGuild', guildId);
  } catch {}
}

function scrollBehavior() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

function GuildAvatar({ guild, large = false }) {
  if (guild.iconUrl) {
    return (
      <img
        className={large ? 'guild-avatar large' : 'guild-avatar'}
        src={guild.iconUrl}
        alt=""
      />
    );
  }

  return (
    <span
      className={
        large ? 'guild-avatar guild-initial large' : 'guild-avatar guild-initial'
      }
      aria-label={t('guild.initial', { name: guild.name })}
    >
      {guild.name.slice(0, 1).toLocaleUpperCase()}
    </span>
  );
}

function Login({ error, onDismiss }) {
  return (
    <main className="login-shell">
      <header className="login-header">
        <div className="brand-lockup">
          <span className="brand-mark">{t('brand.mark')}</span>
          <span>{t('brand.name')}</span>
        </div>
      </header>

      <section className="login-hero">
        <div className="login-copy">
          <p className="eyebrow">{t('login.eyebrow')}</p>
          <h1>{t('login.title')}</h1>
          <p className="hero-description">{t('login.description')}</p>
          <a className="button primary login-button" href="/auth/discord">
            <Icon name="discord" />
            {t('login.connect')}
          </a>

          <div className="security-note">
            <Icon name="shield" />
            <div>
              <strong>{t('login.securityTitle')}</strong>
              <span>{t('login.securityBody')}</span>
            </div>
          </div>
        </div>

        <div className="feature-stack">
          {[
            ['shield', 'login.featureModerationTitle', 'login.featureModerationBody'],
            ['spark', 'login.featureAutomationTitle', 'login.featureAutomationBody'],
            ['message', 'login.featureCommunityTitle', 'login.featureCommunityBody'],
          ].map(([icon, title, body], index) => (
            <article className={`feature-card feature-${index}`} key={title}>
              <span className="feature-icon">
                <Icon name={icon} />
              </span>
              <div>
                <h2>{t(title)}</h2>
                <p>{t(body)}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {error ? <Toast type="error" message={error} onDismiss={onDismiss} /> : null}
    </main>
  );
}

function Toast({ type = 'success', message, onDismiss, duration = 0 }) {
  useEffect(() => {
    if (!duration) return undefined;
    const timeout = window.setTimeout(onDismiss, duration);
    return () => window.clearTimeout(timeout);
  }, [duration, onDismiss]);

  return (
    <div
      className={`toast ${type}`}
      role={type === 'error' ? 'alert' : 'status'}
      style={duration ? { '--toast-duration': `${duration}ms` } : undefined}
    >
      <span className="toast-icon">
        <Icon name={type === 'error' ? 'alert' : 'check'} />
      </span>
      <span className="toast-message">{message}</span>
      <button
        className="icon-button"
        type="button"
        onClick={onDismiss}
        aria-label={t('common.close')}
      >
        <Icon name="close" size={18} />
      </button>
      {duration ? <span className="toast-progress" aria-hidden="true" /> : null}
    </div>
  );
}

function Loading() {
  return (
    <main className="loading-screen">
      <span className="loader" />
      <span>{t('common.loading')}</span>
    </main>
  );
}

function SettingSection({ id, title, children, active = true }) {
  return (
    <section
      className="settings-section module-page"
      id={id}
      hidden={!active}
      aria-label={title}
    >
      {children}
    </section>
  );
}

function SelectField({
  id,
  label,
  help,
  icon,
  value,
  onChange,
  options,
  disabled = false,
}) {
  return (
    <div className="field-row">
      <div className="field-copy">
        <label htmlFor={id}>{label}</label>
        <p>{help}</p>
      </div>
      <Select
        id={id}
        label={label}
        value={value ?? ''}
        onChange={(nextValue) => onChange(nextValue || null)}
        options={[{ id: '', label: t('common.none') }, ...options]}
        disabled={disabled}
        icon={icon}
        variant="field-select"
      />
    </div>
  );
}

function ToggleField({ id, label, help, checked, onChange }) {
  return (
    <div className="field-row">
      <div className="field-copy">
        <label htmlFor={id}>{label}</label>
        <p>{help}</p>
      </div>
      <button
        id={id}
        className={`toggle ${checked ? 'checked' : ''}`}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
      >
        <span>{checked ? t('common.on') : t('common.off')}</span>
        <i />
      </button>
    </div>
  );
}

function InputField({
  id,
  label,
  help,
  value,
  onChange,
  type = 'text',
  min,
  max,
  maxLength,
  multiline = false,
  placeholder,
}) {
  const shared = {
    id,
    value,
    maxLength,
    placeholder,
    onChange: (event) => {
      if (type !== 'number') {
        onChange(event.target.value);
        return;
      }
      const parsed = Number.parseInt(event.target.value, 10);
      const fallback = min ?? 0;
      const value = Number.isNaN(parsed) ? fallback : parsed;
      onChange(Math.min(max ?? value, Math.max(min ?? value, value)));
    },
  };

  return (
    <div className="field-row input-field-row">
      <div className="field-copy">
        <label htmlFor={id}>{label}</label>
        <p>{help}</p>
      </div>
      <div className="input-wrap">
        {multiline ? (
          <textarea {...shared} rows="4" />
        ) : (
          <input {...shared} type={type} min={min} max={max} />
        )}
      </div>
    </div>
  );
}

function MultiSelectField({
  id,
  label,
  help,
  value,
  onChange,
  options,
  icon = 'settings',
}) {
  const [selected, setSelected] = useState('');
  const available = options.filter((option) => !value.includes(option.id));
  const labels = new Map(options.map((option) => [option.id, option.label]));

  function add() {
    if (!selected || value.includes(selected)) return;
    onChange([...value, selected]);
    setSelected('');
  }

  return (
    <div className="field-row input-field-row">
      <div className="field-copy">
        <label htmlFor={id}>{label}</label>
        <p>{help}</p>
      </div>
      <div className="list-editor">
        <div className="list-editor-add">
          <Select
            id={id}
            label={label}
            value={selected}
            onChange={setSelected}
            options={available}
            placeholder={t('common.choose')}
            icon={icon}
            variant="field-select"
          />
          <button
            className="button secondary"
            type="button"
            disabled={!selected}
            onClick={add}
          >
            {t('common.addItem')}
          </button>
        </div>
        {value.length ? (
          <div className="token-list">
            {value.map((item) => (
              <span className="token-item" key={item}>
                <span>{labels.get(item) ?? item}</span>
                <button
                  type="button"
                  aria-label={t('common.removeItem', { item: labels.get(item) ?? item })}
                  onClick={() => onChange(value.filter((candidate) => candidate !== item))}
                >
                  <Icon name="close" size={14} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <span className="list-editor-empty">{t('common.noExemptions')}</span>
        )}
      </div>
    </div>
  );
}

function MissingBot({ guild, onRefresh }) {
  return (
    <div className="empty-state install-state">
      <span className="empty-icon">
        <Icon name="spark" size={28} />
      </span>
      <h1>{t('guild.botMissingTitle', { server: guild.name })}</h1>
      <p>{t('guild.botMissingBody')}</p>
      <div className="button-row">
        <a
          className="button primary"
          href={guild.installUrl}
          target="_blank"
          rel="noreferrer"
        >
          {t('guild.install')}
          <Icon name="external" size={17} />
        </a>
        <button className="button secondary" type="button" onClick={onRefresh}>
          <Icon name="refresh" size={17} />
          {t('guild.refresh')}
        </button>
      </div>
    </div>
  );
}

function NoGuilds({ onRefresh }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name="shield" size={28} />
      </span>
      <h1>{t('guild.noServersTitle')}</h1>
      <p>{t('guild.noServersBody')}</p>
      <button className="button secondary" type="button" onClick={onRefresh}>
        <Icon name="refresh" size={17} />
        {t('guild.refresh')}
      </button>
    </div>
  );
}

function LoadFailure({ message, onRetry }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name="alert" size={28} />
      </span>
      <h1>{t('error.title')}</h1>
      <p>{message}</p>
      <button className="button secondary" type="button" onClick={onRetry}>
        <Icon name="refresh" size={17} />
        {t('common.retry')}
      </button>
    </div>
  );
}

function Dashboard({ session, onSessionExpired }) {
  const [guilds, setGuilds] = useState([]);
  const [selectedGuildId, setSelectedGuildId] = useState(null);
  const [loadingGuilds, setLoadingGuilds] = useState(true);
  const [guildsError, setGuildsError] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState(false);
  const [savedSettings, setSavedSettings] = useState(null);
  const [draft, setDraft] = useState(null);
  const [resources, setResources] = useState(null);
  const [toast, setToast] = useState(null);
  const [saving, setSaving] = useState(false);
  const [reactionPending, setReactionPending] = useState(false);
  const [reactionMode, setReactionMode] = useState('existing');
  const [reactionForm, setReactionForm] = useState(emptyReactionForm);
  const [embedForm, setEmbedForm] = useState(emptyEmbedForm);
  const [embedPending, setEmbedPending] = useState(false);
  const [lastPublishedEmbed, setLastPublishedEmbed] = useState(null);
  const [moderationCases, setModerationCases] = useState([]);
  const [moderationCasesLoading, setModerationCasesLoading] = useState(false);
  const [moderationCaseQuery, setModerationCaseQuery] = useState('');
  const [commandQuery, setCommandQuery] = useState('');
  const [autoresponderForm, setAutoresponderForm] = useState({
    trigger: '',
    response: '',
    match: 'contains',
  });
  const [customForm, setCustomForm] = useState({ name: '', response: '' });
  const initialRoute = routeState();
  const [activeSection, setActiveSection] = useState(initialRoute.page);
  const requestSequence = useRef(0);
  const toastSequence = useRef(0);
  const activeGuildId = useRef(null);
  const failedSaveSignature = useRef(null);

  const dismissToast = useCallback(() => setToast(null), []);

  const showSuccess = useCallback((message) => {
    toastSequence.current += 1;
    setToast({
      id: toastSequence.current,
      type: 'success',
      message,
      duration: 3600,
    });
  }, []);

  const showError = useCallback(
    (error) => {
      if (
        error instanceof ApiError &&
        ['AUTH_REQUIRED', 'DISCORD_SESSION_EXPIRED', 'INVALID_CSRF'].includes(error.code)
      ) {
        onSessionExpired(error);
        return;
      }
      toastSequence.current += 1;
      setToast({
        id: toastSequence.current,
        type: 'error',
        message: translatedError(error),
      });
    },
    [onSessionExpired],
  );

  const loadGuilds = useCallback(async () => {
    setLoadingGuilds(true);
    setGuildsError(false);
    try {
      const result = await api('/api/guilds');
      setGuilds(result.guilds);
      setSelectedGuildId((current) => {
        if (result.guilds.some((guild) => guild.id === current)) return current;
        const routed = routeState().guildId;
        const remembered = rememberedGuild();
        const selected =
          result.guilds.find((guild) => guild.id === routed) ??
          result.guilds.find((guild) => guild.id === remembered) ??
          result.guilds.find((guild) => guild.botInstalled) ??
          result.guilds[0];
        return selected?.id ?? null;
      });
    } catch (error) {
      setGuildsError(true);
      showError(error);
    } finally {
      setLoadingGuilds(false);
    }
  }, [showError]);

  useEffect(() => {
    loadGuilds();
  }, [loadGuilds]);

  const selectedGuild = guilds.find((guild) => guild.id === selectedGuildId) ?? null;

  const loadSettings = useCallback(
    async (guild) => {
      const sequence = ++requestSequence.current;
      setSavedSettings(null);
      setDraft(null);
      setResources(null);
      setSettingsError(false);
      if (!guild?.botInstalled) return;

      setLoadingSettings(true);
      try {
        const result = await api(`/api/guilds/${guild.id}/settings`);
        if (sequence !== requestSequence.current) return;
        setSavedSettings(result.settings);
        setDraft(result.settings);
        setResources(result.resources);
      } catch (error) {
        if (sequence === requestSequence.current) {
          setSettingsError(true);
          showError(error);
        }
      } finally {
        if (sequence === requestSequence.current) setLoadingSettings(false);
      }
    },
    [showError],
  );

  useEffect(() => {
    activeGuildId.current = selectedGuildId;
    failedSaveSignature.current = null;
    if (selectedGuildId) rememberGuild(selectedGuildId);
    loadSettings(selectedGuild);
  }, [selectedGuildId, selectedGuild, loadSettings]);

  useEffect(() => {
    const onPopState = () => {
      const next = routeState();
      setActiveSection(next.page);
      if (next.guildId && guilds.some((guild) => guild.id === next.guildId)) {
        setSelectedGuildId(next.guildId);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [guilds]);

  useEffect(() => {
    if (!selectedGuildId) return;
    const current = routeState();
    if (current.guildId === selectedGuildId && current.page === activeSection) return;
    window.history.replaceState(
      {},
      '',
      dashboardPath(selectedGuildId, activeSection),
    );
  }, [selectedGuildId, activeSection]);

  useEffect(() => {
    if (
      activeSection !== 'moderation' ||
      !selectedGuild?.botInstalled ||
      loadingSettings
    ) {
      return undefined;
    }

    let cancelled = false;
    setModerationCasesLoading(true);
    api(`/api/guilds/${selectedGuild.id}/moderation-cases?limit=150`)
      .then((result) => {
        if (!cancelled) setModerationCases(result.cases ?? []);
      })
      .catch((error) => {
        if (!cancelled) showError(error);
      })
      .finally(() => {
        if (!cancelled) setModerationCasesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    activeSection,
    loadingSettings,
    selectedGuild?.botInstalled,
    selectedGuild?.id,
    showError,
  ]);

  useEffect(() => {
    if (!window.matchMedia('(max-width: 900px)').matches) return;
    const activeButton = document.querySelector(
      '.sidebar nav button[aria-current="page"]',
    );
    activeButton?.scrollIntoView({
      behavior: scrollBehavior(),
      block: 'nearest',
      inline: 'center',
    });
  }, [activeSection]);

  const editableSettings = useCallback(
    (settings) =>
      settings
        ? {
            logsChannelId: settings.logsChannelId,
            suggestionsChannelId: settings.suggestionsChannelId,
            giveawayChannelId: settings.giveawayChannelId,
            ticketCategoryId: settings.ticketCategoryId,
            autoRoleId: settings.autoRoleId,
            verificationRoleId: settings.verificationRoleId,
            rules: settings.rules,
            currency: settings.currency,
            economy: settings.economy,
            aiChatEnabled: settings.aiChatEnabled,
            automod: settings.automod,
            welcome: settings.welcome,
            goodbye: settings.goodbye,
            giveaways: settings.giveaways,
            music: settings.music,
            actionLog: settings.actionLog,
            autoresponders: settings.autoresponders,
            starboard: settings.starboard,
            modules: settings.modules,
            disabledCommands: settings.disabledCommands,
            customCommands: settings.customCommands,
          }
        : null,
    [],
  );

  const dirty = useMemo(
    () =>
      JSON.stringify(editableSettings(draft)) !==
      JSON.stringify(editableSettings(savedSettings)),
    [draft, savedSettings, editableSettings],
  );

  function navigateSection(section) {
    if (!PAGE_IDS.has(section)) return;
    setActiveSection(section);
    window.history.pushState(
      {},
      '',
      dashboardPath(selectedGuildId, section),
    );
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
  }

  function chooseGuild(value) {
    activeGuildId.current = value;
    setSelectedGuildId(value);
    setActiveSection('overview');
    setToast(null);
    window.history.pushState({}, '', dashboardPath(value, 'overview'));
  }

  function updateField(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  function updateNested(section, field, value) {
    setDraft((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [field]: value,
        ...(section === 'automod' && field !== 'enabled' && value === true
          ? { enabled: true }
          : {}),
      },
    }));
  }

  const autosaveSettings = useCallback(
    async (guildId, snapshot, signature) => {
      setSaving(true);
      const path = `/api/guilds/${guildId}/settings`;
      const options = {
        method: 'PATCH',
        csrfToken: session.csrfToken,
        body: snapshot,
      };

      try {
        let result;
        try {
          result = await api(path, options);
        } catch (error) {
          if (!(error instanceof ApiError) || error.code !== 'NETWORK_ERROR') throw error;
          await new Promise((resolve) => window.setTimeout(resolve, 500));
          result = await api(path, options);
        }

        if (activeGuildId.current !== guildId) return;
        failedSaveSignature.current = null;
        setSavedSettings(result.settings);
        setDraft((current) =>
          JSON.stringify(editableSettings(current)) === signature
            ? result.settings
            : current,
        );
        showSuccess(t('status.saved'));
      } catch (error) {
        if (activeGuildId.current === guildId) {
          failedSaveSignature.current = signature;
          showError(error);
        }
      } finally {
        setSaving(false);
      }
    },
    [editableSettings, session.csrfToken, showError, showSuccess],
  );

  useEffect(() => {
    if (!dirty || saving || !selectedGuild?.botInstalled || !draft) return undefined;

    const snapshot = editableSettings(draft);
    const signature = JSON.stringify(snapshot);
    if (failedSaveSignature.current === signature) return undefined;

    const guildId = selectedGuild.id;
    const timeout = window.setTimeout(
      () => autosaveSettings(guildId, snapshot, signature),
      650,
    );

    return () => window.clearTimeout(timeout);
  }, [
    autosaveSettings,
    dirty,
    draft,
    editableSettings,
    saving,
    selectedGuild?.botInstalled,
    selectedGuild?.id,
  ]);

  function mergeReactionSettings(nextSettings) {
    setSavedSettings((current) => ({
      ...current,
      reactionRoles: nextSettings.reactionRoles,
    }));
    setDraft((current) => ({ ...current, reactionRoles: nextSettings.reactionRoles }));
  }

  async function addReactionRole(event) {
    event.preventDefault();
    if (!selectedGuild) return;
    setReactionPending(true);
    try {
      const endpoint =
        reactionMode === 'embed'
          ? `/api/guilds/${selectedGuild.id}/reaction-role-embeds`
          : `/api/guilds/${selectedGuild.id}/reaction-roles`;
      const body =
        reactionMode === 'embed'
          ? {
              channelId: reactionForm.channelId,
              roleId: reactionForm.roleId,
              emoji: reactionForm.emoji,
              content: reactionForm.content,
              embed: reactionForm.embed,
            }
          : {
              messageLink: reactionForm.messageLink,
              roleId: reactionForm.roleId,
              emoji: reactionForm.emoji,
            };
      const result = await api(endpoint, {
        method: 'POST',
        csrfToken: session.csrfToken,
        body,
      });
      mergeReactionSettings(result.settings);
      setReactionForm(emptyReactionForm());
      showSuccess(
        result.messageLink
          ? t('status.reactionEmbedAdded', { link: result.messageLink })
          : t('status.reactionAdded'),
      );
    } catch (error) {
      showError(error);
    } finally {
      setReactionPending(false);
    }
  }

  async function clearLegacyUserPolicies() {
    if (!selectedGuild) return;
    try {
      const result = await api(
        `/api/guilds/${selectedGuild.id}/legacy-user-policies`,
        {
          method: 'DELETE',
          csrfToken: session.csrfToken,
        },
      );
      setSavedSettings((current) => ({
        ...current,
        legacyUserPolicies: result.settings.legacyUserPolicies,
      }));
      setDraft((current) => ({
        ...current,
        legacyUserPolicies: result.settings.legacyUserPolicies,
      }));
      showSuccess(t('status.legacyPoliciesCleared'));
    } catch (error) {
      showError(error);
    }
  }

  async function removeReactionRole(key) {
    if (!selectedGuild) return;
    setReactionPending(true);
    try {
      const result = await api(`/api/guilds/${selectedGuild.id}/reaction-roles`, {
        method: 'DELETE',
        csrfToken: session.csrfToken,
        body: { key },
      });
      mergeReactionSettings(result.settings);
      showSuccess(t('status.reactionRemoved'));
    } catch (error) {
      showError(error);
    } finally {
      setReactionPending(false);
    }
  }

  async function publishEmbed(event) {
    event.preventDefault();
    if (!selectedGuild || !embedForm.channelId) return;
    setEmbedPending(true);
    try {
      const result = await api(`/api/guilds/${selectedGuild.id}/embeds`, {
        method: 'POST',
        csrfToken: session.csrfToken,
        body: embedForm,
      });
      setLastPublishedEmbed(result);
      setEmbedForm(emptyEmbedForm());
      showSuccess(t('status.embedPublished'));
    } catch (error) {
      showError(error);
    } finally {
      setEmbedPending(false);
    }
  }

  function addAutoresponder(event) {
    event.preventDefault();
    const trigger = autoresponderForm.trigger.trim();
    const response = autoresponderForm.response.trim();
    if (!trigger || !response) return;
    const id = crypto.randomUUID().replaceAll('-', '').slice(0, 32);
    setDraft((current) => ({
      ...current,
      autoresponders: [
        ...current.autoresponders,
        {
          id,
          trigger,
          response,
          match: autoresponderForm.match,
          enabled: true,
        },
      ],
    }));
    setAutoresponderForm({ trigger: '', response: '', match: 'contains' });
  }

  function updateAutoresponder(id, patch) {
    setDraft((current) => ({
      ...current,
      autoresponders: current.autoresponders.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    }));
  }

  function removeAutoresponder(id) {
    setDraft((current) => ({
      ...current,
      autoresponders: current.autoresponders.filter((entry) => entry.id !== id),
    }));
  }

  function saveCustomCommand(event) {
    event.preventDefault();
    const name = customForm.name.trim().toLocaleLowerCase('en-US');
    const response = customForm.response.trim();
    if (!/^[a-z0-9-]{1,32}$/u.test(name) || !response) return;
    setDraft((current) => ({
      ...current,
      customCommands: { ...current.customCommands, [name]: response },
    }));
    setCustomForm({ name: '', response: '' });
  }

  function removeCustomCommand(name) {
    setDraft((current) => {
      const customCommands = { ...current.customCommands };
      delete customCommands[name];
      return { ...current, customCommands };
    });
  }

  async function signOut() {
    try {
      await api('/api/logout', { method: 'POST', csrfToken: session.csrfToken });
      onSessionExpired(null);
    } catch (error) {
      showError(error);
    }
  }

  const channelOptions = (resources?.channels ?? []).map((channel) => ({
    id: channel.id,
    label: t('common.channelPrefix', { name: channel.name }),
  }));
  const categoryOptions = (resources?.categories ?? []).map((category) => ({
    id: category.id,
    label: category.name,
  }));
  const allRoleOptions = (resources?.roles ?? []).map((role) => ({
    id: role.id,
    label: t('common.rolePrefix', { name: role.name }),
  }));
  const roleOptions = (resources?.roles ?? [])
    .filter((role) => role.assignable)
    .map((role) => ({
      id: role.id,
      label: t('common.rolePrefix', { name: role.name }),
    }));
  const guildOptions = guilds.map((guild) => ({
    id: guild.id,
    label: guild.name,
    guild,
  }));
  const channelNames = new Map(
    (resources?.channels ?? []).map((channel) => [channel.id, channel.name]),
  );
  const roleNames = new Map((resources?.roles ?? []).map((role) => [role.id, role.name]));
  const normalizedCaseQuery = moderationCaseQuery.trim().toLocaleLowerCase('en-US');
  const visibleModerationCases = normalizedCaseQuery
    ? moderationCases.filter((entry) =>
        [
          entry.action,
          entry.actorTag,
          entry.actorId,
          entry.targetTag,
          entry.targetId,
          entry.reason,
          entry.evidence?.content,
        ]
          .filter(Boolean)
          .some((value) =>
            String(value).toLocaleLowerCase('en-US').includes(normalizedCaseQuery),
          ),
      )
    : moderationCases;
  const activeNavigation =
    NAVIGATION.find(([id]) => id === activeSection) ?? NAVIGATION[0];
  const activePageTitle = t(activeNavigation[1]);
  const activePageDescription = t(
    PAGE_DESCRIPTION_KEYS[activeSection] ?? 'overview.description',
  );
  const normalizedCommandQuery = commandQuery.trim().toLocaleLowerCase('en-US');
  const visibleCommands = (resources?.commands ?? []).filter((command) => {
    if (!normalizedCommandQuery) return true;
    return [command.name, command.description].some((value) =>
      value.toLocaleLowerCase('en-US').includes(normalizedCommandQuery),
    );
  });
  const automodActive =
    draft?.automod?.enabled === true &&
    [
      draft.automod.antiLink,
      draft.automod.antiSwear,
      draft.automod.antiSpam,
      draft.automod.antiMentionSpam,
      draft.automod.antiCaps,
      draft.automod.antiEmojiSpam,
      draft.automod.antiAttachmentSpam,
      draft.automod.antiLinkSpam,
      draft.automod.antiAlt,
      draft.automod.antiBot,
      draft.automod.antiRaid,
    ].some(Boolean);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup sidebar-brand">
          <span className="brand-mark">{t('brand.mark')}</span>
          <div>
            <strong>{t('brand.name')}</strong>
            <span>{t('brand.dashboard')}</span>
          </div>
        </div>

        <div className="guild-picker-label">{t('guild.managed')}</div>
        <div className="guild-picker">
          {selectedGuild ? (
            <GuildAvatar guild={selectedGuild} />
          ) : (
            <span className="guild-avatar guild-initial">{t('brand.mark')}</span>
          )}
          <Select
            label={t('guild.choose')}
            value={selectedGuildId ?? ''}
            onChange={chooseGuild}
            options={guildOptions}
            variant="guild-select"
            renderOption={(option) => <span className="guild-option-name">{option.label}</span>}
          />
        </div>

        <p className="nav-label">{t('nav.workspace')}</p>
        <nav>
          {NAVIGATION.map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              aria-current={activeSection === id ? 'page' : undefined}
              data-section={id}
              onClick={() => navigateSection(id)}
            >
              <Icon name={icon} />
              {t(label)}
            </button>
          ))}
        </nav>

        <div className="account-card">
          {session.user.avatarUrl ? (
            <img src={session.user.avatarUrl} alt="" />
          ) : (
            <span className="account-avatar">
              {session.user.globalName.slice(0, 1).toLocaleUpperCase()}
            </span>
          )}
          <div>
            <strong>{session.user.globalName}</strong>
            <span>{session.user.username}</span>
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={signOut}
            aria-label={t('nav.signOut')}
          >
            <Icon name="logout" size={18} />
          </button>
        </div>
      </aside>

      <main className="dashboard-main">
        <header className="mobile-toolbar">
          <div className="mobile-guild-picker">
            <small>{t('header.mobileGuild')}</small>
            <Select
              label={t('guild.choose')}
              value={selectedGuildId ?? ''}
              onChange={chooseGuild}
              options={guildOptions}
              variant="mobile-guild-select"
            />
          </div>
          <button
            className="icon-button"
            type="button"
            onClick={signOut}
            aria-label={t('nav.signOut')}
          >
            <Icon name="logout" size={18} />
          </button>
        </header>
        {loadingGuilds ? <Loading /> : null}
        {!loadingGuilds && guildsError ? (
          <LoadFailure message={t('error.loadGuilds')} onRetry={loadGuilds} />
        ) : null}
        {!loadingGuilds && !guildsError && guilds.length === 0 ? (
          <NoGuilds onRefresh={loadGuilds} />
        ) : null}
        {!loadingGuilds &&
        !guildsError &&
        selectedGuild &&
        !selectedGuild.botInstalled ? (
          <MissingBot guild={selectedGuild} onRefresh={loadGuilds} />
        ) : null}
        {!loadingGuilds &&
        !guildsError &&
        selectedGuild?.botInstalled &&
        loadingSettings ? (
          <Loading />
        ) : null}
        {!loadingGuilds &&
        !guildsError &&
        selectedGuild?.botInstalled &&
        !loadingSettings &&
        settingsError ? (
          <LoadFailure
            message={t('error.loadSettings')}
            onRetry={() => loadSettings(selectedGuild)}
          />
        ) : null}

        {!loadingGuilds &&
        !guildsError &&
        selectedGuild?.botInstalled &&
        draft &&
        resources ? (
          <div className="dashboard-content">
            <header className="dashboard-header">
              <div className="server-heading">
                <GuildAvatar guild={selectedGuild} large />
                <div>
                  <p className="eyebrow">{selectedGuild.name}</p>
                  <h1>{activePageTitle}</h1>
                  <p>{activePageDescription}</p>
                </div>
              </div>
              <div className={`save-status ${dirty || saving ? 'dirty' : ''}`}>
                <span>
                  <Icon name={dirty || saving ? 'refresh' : 'check'} size={15} />
                  {saving
                    ? t('common.saving')
                    : dirty
                      ? t('header.autosavePending')
                      : t('header.saved')}
                </span>
              </div>
            </header>

            <SettingSection
              id="overview"
              active={activeSection === 'overview'}
              title={t('overview.title')}
              description={t('overview.description')}
            >
              <div className="stat-grid">
                <article className="stat-card">
                  <span>
                    <Icon name="link" />
                  </span>
                  <div>
                    <small>{t('overview.protection')}</small>
                    <strong>
                      {automodActive ? t('common.on') : t('common.off')}
                    </strong>
                  </div>
                </article>
                <article className="stat-card">
                  <span>
                    <Icon name="hash" />
                  </span>
                  <div>
                    <small>{t('overview.logging')}</small>
                    <strong>
                      {draft.logsChannelId
                        ? t('common.configured')
                        : t('common.notConfigured')}
                    </strong>
                  </div>
                </article>
                <article className="stat-card">
                  <span>
                    <Icon name="role" />
                  </span>
                  <div>
                    <small>{t('overview.autoRole')}</small>
                    <strong>
                      {draft.autoRoleId
                        ? t('common.configured')
                        : t('common.notConfigured')}
                    </strong>
                  </div>
                </article>
                <article className="stat-card">
                  <span>
                    <Icon name="users" />
                  </span>
                  <div>
                    <small>{t('overview.reactionRoles')}</small>
                    <strong>
                      {t('overview.mappingCount', { count: draft.reactionRoles.length })}
                    </strong>
                  </div>
                </article>
              </div>
            </SettingSection>

            <SettingSection
              id="moderation"
              active={activeSection === 'moderation'}
              title={t('moderation.title')}
              description={t('moderation.description')}
            >
              <div className="settings-card">
                <SelectField
                  id="logs-channel"
                  label={t('moderation.logChannel')}
                  help={t('moderation.logHelp')}
                  icon="hash"
                  value={draft.logsChannelId}
                  onChange={(value) => updateField('logsChannelId', value)}
                  options={channelOptions}
                />
                <InputField
                  id="server-rules"
                  label={t('moderation.rules')}
                  help={t('moderation.rulesHelp')}
                  value={draft.rules}
                  onChange={(value) => updateField('rules', value)}
                  maxLength={1900}
                  multiline
                  placeholder={t('moderation.rulesPlaceholder')}
                />
              </div>

              <div className="settings-card">
                <div className="subsection-heading page-card-heading">
                  <div>
                    <h3>{t('moderation.actionLogTitle')}</h3>
                    <p>{t('moderation.actionLogDescription')}</p>
                  </div>
                </div>
                <ToggleField
                  id="action-log-enabled"
                  label={t('moderation.actionLogEnabled')}
                  help={t('moderation.actionLogEnabledHelp')}
                  checked={draft.actionLog.enabled}
                  onChange={(value) => updateNested('actionLog', 'enabled', value)}
                />
                <SelectField
                  id="action-log-channel"
                  label={t('moderation.actionLogChannel')}
                  help={t('moderation.actionLogChannelHelp')}
                  icon="hash"
                  value={draft.actionLog.channelId}
                  onChange={(value) => updateNested('actionLog', 'channelId', value)}
                  options={channelOptions}
                />
                {[
                  ['messageDelete', 'moderation.logMessageDelete'],
                  ['messageEdit', 'moderation.logMessageEdit'],
                  ['memberJoin', 'moderation.logMemberJoin'],
                  ['memberLeave', 'moderation.logMemberLeave'],
                  ['roleChanges', 'moderation.logRoleChanges'],
                ].map(([field, label]) => (
                  <ToggleField
                    id={`action-log-${field}`}
                    key={field}
                    label={t(label)}
                    help={t(`${label}Help`)}
                    checked={draft.actionLog[field]}
                    onChange={(value) => updateNested('actionLog', field, value)}
                  />
                ))}
              </div>

              <div className="settings-card moderation-history-card">
                <div className="subsection-heading moderation-history-heading">
                  <div>
                    <h3>{t('moderation.historyTitle')}</h3>
                    <p>{t('moderation.historyDescription')}</p>
                  </div>
                  <input
                    className="moderation-history-search"
                    value={moderationCaseQuery}
                    placeholder={t('moderation.historySearch')}
                    onChange={(event) => setModerationCaseQuery(event.target.value)}
                  />
                </div>

                {moderationCasesLoading ? (
                  <div className="moderation-history-empty">
                    <span className="loader" />
                    {t('common.loading')}
                  </div>
                ) : visibleModerationCases.length ? (
                  <div className="moderation-case-list">
                    {visibleModerationCases.map((entry) => (
                      <article className="moderation-case" key={`${entry.id}-${entry.at}`}>
                        <div className="moderation-case-head">
                          <span className="moderation-case-id">
                            #{entry.id ?? '—'}
                          </span>
                          <strong>{entry.action}</strong>
                          <time dateTime={entry.at ?? undefined}>
                            {entry.at ? new Date(entry.at).toLocaleString() : '—'}
                          </time>
                        </div>
                        <div className="moderation-case-grid">
                          <div>
                            <small>{t('moderation.target')}</small>
                            <span>{entry.targetTag ?? entry.targetId ?? '—'}</span>
                          </div>
                          <div>
                            <small>{t('moderation.moderator')}</small>
                            <span>{entry.actorTag ?? entry.actorId ?? '—'}</span>
                          </div>
                          <div>
                            <small>{t('moderation.reason')}</small>
                            <span>{entry.reason ?? t('moderation.noReason')}</span>
                          </div>
                          <div>
                            <small>{t('moderation.source')}</small>
                            <span>{entry.source}</span>
                          </div>
                        </div>
                        {entry.evidence?.content ? (
                          <div className="moderation-evidence">
                            <div className="moderation-evidence-head">
                              <strong>{t('moderation.evidence')}</strong>
                              {entry.evidence.channelId ? (
                                <span>
                                  #{channelNames.get(entry.evidence.channelId) ??
                                    entry.evidence.channelId}
                                </span>
                              ) : null}
                            </div>
                            <pre>{entry.evidence.content}</pre>
                            {entry.evidence.attachments?.length ? (
                              <div className="moderation-evidence-files">
                                {entry.evidence.attachments.map((attachment, index) =>
                                  attachment.url ? (
                                    <a
                                      href={attachment.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      key={`${attachment.url}-${index}`}
                                    >
                                      {attachment.name ?? t('moderation.attachment')}
                                      <Icon name="external" size={13} />
                                    </a>
                                  ) : null,
                                )}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="moderation-history-empty">
                    <Icon name="shield" size={20} />
                    <span>{t('moderation.historyEmpty')}</span>
                  </div>
                )}
              </div>
            </SettingSection>

            <SettingSection
              id="automod"
              active={activeSection === 'automod'}
              title={t('automod.title')}
              description={t('automod.description')}
            >
              <div className="settings-card automod-card">
                <div className="subsection-heading">
                  <div>
                    <h3>{t('automod.contentTitle')}</h3>
                    <p>{t('automod.contentDescription')}</p>
                  </div>
                </div>
                <ToggleField
                  id="automod-master"
                  label={t('automod.master')}
                  help={t('automod.masterHelp')}
                  checked={draft.automod.enabled}
                  onChange={(value) => updateNested('automod', 'enabled', value)}
                />
                <ToggleField
                  id="anti-link"
                  label={t('automod.antiLink')}
                  help={t('automod.antiLinkHelp')}
                  checked={draft.automod.antiLink}
                  onChange={(value) => updateNested('automod', 'antiLink', value)}
                />
                <ToggleField
                  id="anti-swear"
                  label={t('automod.antiSwear')}
                  help={t('automod.antiSwearHelp')}
                  checked={draft.automod.antiSwear}
                  onChange={(value) => updateNested('automod', 'antiSwear', value)}
                />
                <InputField
                  id="blocked-words"
                  label={t('automod.blockedWords')}
                  help={t('automod.blockedWordsHelp')}
                  value={draft.automod.blockedWords.join(', ')}
                  maxLength={6500}
                  placeholder={t('automod.blockedWordsPlaceholder')}
                  onChange={(value) =>
                    updateNested(
                      'automod',
                      'blockedWords',
                      value
                        .split(',')
                        .map((word) => word.trim().slice(0, 64))
                        .filter(Boolean)
                        .slice(0, 100),
                    )
                  }
                />
              </div>

              <div className="settings-card automod-card">
                <div className="subsection-heading">
                  <div>
                    <h3>{t('automod.spamTitle')}</h3>
                    <p>{t('automod.spamDescription')}</p>
                  </div>
                </div>
                <ToggleField
                  id="anti-spam"
                  label={t('automod.antiSpam')}
                  help={t('automod.antiSpamHelp')}
                  checked={draft.automod.antiSpam}
                  onChange={(value) => updateNested('automod', 'antiSpam', value)}
                />
                <InputField
                  id="spam-message-threshold"
                  label={t('automod.spamMessageThreshold')}
                  help={t('automod.spamMessageThresholdHelp')}
                  type="number"
                  min={2}
                  max={50}
                  value={draft.automod.spamMessageThreshold}
                  onChange={(value) =>
                    updateNested('automod', 'spamMessageThreshold', value)
                  }
                />
                <InputField
                  id="spam-window"
                  label={t('automod.spamWindow')}
                  help={t('automod.spamWindowHelp')}
                  type="number"
                  min={1}
                  max={120}
                  value={draft.automod.spamWindowSeconds}
                  onChange={(value) => updateNested('automod', 'spamWindowSeconds', value)}
                />
                <InputField
                  id="duplicate-threshold"
                  label={t('automod.duplicateThreshold')}
                  help={t('automod.duplicateThresholdHelp')}
                  type="number"
                  min={2}
                  max={20}
                  value={draft.automod.duplicateThreshold}
                  onChange={(value) =>
                    updateNested('automod', 'duplicateThreshold', value)
                  }
                />
                <InputField
                  id="duplicate-window"
                  label={t('automod.duplicateWindow')}
                  help={t('automod.duplicateWindowHelp')}
                  type="number"
                  min={2}
                  max={300}
                  value={draft.automod.duplicateWindowSeconds}
                  onChange={(value) =>
                    updateNested('automod', 'duplicateWindowSeconds', value)
                  }
                />
                <ToggleField
                  id="anti-mention-spam"
                  label={t('automod.antiMentionSpam')}
                  help={t('automod.antiMentionSpamHelp')}
                  checked={draft.automod.antiMentionSpam}
                  onChange={(value) =>
                    updateNested('automod', 'antiMentionSpam', value)
                  }
                />
                <InputField
                  id="mention-threshold"
                  label={t('automod.mentionThreshold')}
                  help={t('automod.mentionThresholdHelp')}
                  type="number"
                  min={2}
                  max={50}
                  value={draft.automod.mentionThreshold}
                  onChange={(value) => updateNested('automod', 'mentionThreshold', value)}
                />
                <ToggleField
                  id="anti-caps"
                  label={t('automod.antiCaps')}
                  help={t('automod.antiCapsHelp')}
                  checked={draft.automod.antiCaps}
                  onChange={(value) => updateNested('automod', 'antiCaps', value)}
                />
                <InputField
                  id="caps-percentage"
                  label={t('automod.capsPercentage')}
                  help={t('automod.capsPercentageHelp')}
                  type="number"
                  min={50}
                  max={100}
                  value={draft.automod.capsPercentage}
                  onChange={(value) => updateNested('automod', 'capsPercentage', value)}
                />
                <InputField
                  id="caps-minimum"
                  label={t('automod.capsMinimum')}
                  help={t('automod.capsMinimumHelp')}
                  type="number"
                  min={4}
                  max={500}
                  value={draft.automod.capsMinimumCharacters}
                  onChange={(value) =>
                    updateNested('automod', 'capsMinimumCharacters', value)
                  }
                />
                <ToggleField
                  id="anti-emoji-spam"
                  label={t('automod.antiEmojiSpam')}
                  help={t('automod.antiEmojiSpamHelp')}
                  checked={draft.automod.antiEmojiSpam}
                  onChange={(value) =>
                    updateNested('automod', 'antiEmojiSpam', value)
                  }
                />
                <InputField
                  id="emoji-threshold"
                  label={t('automod.emojiThreshold')}
                  help={t('automod.emojiThresholdHelp')}
                  type="number"
                  min={3}
                  max={100}
                  value={draft.automod.emojiThreshold}
                  onChange={(value) => updateNested('automod', 'emojiThreshold', value)}
                />
                <ToggleField
                  id="anti-attachment-spam"
                  label={t('automod.antiAttachmentSpam')}
                  help={t('automod.antiAttachmentSpamHelp')}
                  checked={draft.automod.antiAttachmentSpam}
                  onChange={(value) =>
                    updateNested('automod', 'antiAttachmentSpam', value)
                  }
                />
                <InputField
                  id="attachment-threshold"
                  label={t('automod.attachmentThreshold')}
                  help={t('automod.attachmentThresholdHelp')}
                  type="number"
                  min={2}
                  max={50}
                  value={draft.automod.attachmentThreshold}
                  onChange={(value) =>
                    updateNested('automod', 'attachmentThreshold', value)
                  }
                />
                <InputField
                  id="attachment-window"
                  label={t('automod.attachmentWindow')}
                  help={t('automod.attachmentWindowHelp')}
                  type="number"
                  min={1}
                  max={120}
                  value={draft.automod.attachmentWindowSeconds}
                  onChange={(value) =>
                    updateNested('automod', 'attachmentWindowSeconds', value)
                  }
                />
                <ToggleField
                  id="anti-link-spam"
                  label={t('automod.antiLinkSpam')}
                  help={t('automod.antiLinkSpamHelp')}
                  checked={draft.automod.antiLinkSpam}
                  onChange={(value) => updateNested('automod', 'antiLinkSpam', value)}
                />
                <InputField
                  id="link-threshold"
                  label={t('automod.linkThreshold')}
                  help={t('automod.linkThresholdHelp')}
                  type="number"
                  min={2}
                  max={50}
                  value={draft.automod.linkThreshold}
                  onChange={(value) => updateNested('automod', 'linkThreshold', value)}
                />
                <InputField
                  id="link-window"
                  label={t('automod.linkWindow')}
                  help={t('automod.linkWindowHelp')}
                  type="number"
                  min={1}
                  max={120}
                  value={draft.automod.linkWindowSeconds}
                  onChange={(value) => updateNested('automod', 'linkWindowSeconds', value)}
                />
              </div>

              <div className="settings-card automod-card">
                <div className="subsection-heading">
                  <div>
                    <h3>{t('automod.joinTitle')}</h3>
                    <p>{t('automod.joinDescription')}</p>
                  </div>
                </div>
                <ToggleField
                  id="anti-alt"
                  label={t('automod.antiAlt')}
                  help={t('automod.antiAltHelp')}
                  checked={draft.automod.antiAlt}
                  onChange={(value) => updateNested('automod', 'antiAlt', value)}
                />
                <InputField
                  id="minimum-account-age"
                  label={t('automod.minimumAge')}
                  help={t('automod.minimumAgeHelp')}
                  type="number"
                  min={0}
                  max={365}
                  value={draft.automod.minimumAccountAgeDays}
                  onChange={(value) =>
                    updateNested('automod', 'minimumAccountAgeDays', value)
                  }
                />
                <ToggleField
                  id="anti-bot"
                  label={t('automod.antiBot')}
                  help={t('automod.antiBotHelp')}
                  checked={draft.automod.antiBot}
                  onChange={(value) => updateNested('automod', 'antiBot', value)}
                />
                <ToggleField
                  id="anti-raid"
                  label={t('automod.antiRaid')}
                  help={t('automod.antiRaidHelp')}
                  checked={draft.automod.antiRaid}
                  onChange={(value) => updateNested('automod', 'antiRaid', value)}
                />
                <InputField
                  id="raid-threshold"
                  label={t('automod.raidThreshold')}
                  help={t('automod.raidThresholdHelp')}
                  type="number"
                  min={3}
                  max={100}
                  value={draft.automod.raidJoinThreshold}
                  onChange={(value) =>
                    updateNested('automod', 'raidJoinThreshold', value)
                  }
                />
              </div>

              <div className="settings-card automod-card">
                <div className="subsection-heading">
                  <div>
                    <h3>{t('automod.enforcementTitle')}</h3>
                    <p>{t('automod.enforcementDescription')}</p>
                  </div>
                </div>
                <InputField
                  id="warning-threshold"
                  label={t('automod.warningThreshold')}
                  help={t('automod.warningThresholdHelp')}
                  type="number"
                  min={1}
                  max={100}
                  value={draft.automod.warningThreshold}
                  onChange={(value) => updateNested('automod', 'warningThreshold', value)}
                />
                <InputField
                  id="timeout-seconds"
                  label={t('automod.timeoutSeconds')}
                  help={t('automod.timeoutSecondsHelp')}
                  type="number"
                  min={10}
                  max={2419200}
                  value={draft.automod.timeoutSeconds}
                  onChange={(value) => updateNested('automod', 'timeoutSeconds', value)}
                />
              </div>

              <div className="settings-card automod-card">
                <div className="subsection-heading">
                  <div>
                    <h3>{t('automod.exemptionsTitle')}</h3>
                    <p>{t('automod.exemptionsDescription')}</p>
                  </div>
                </div>
                {(draft.legacyUserPolicies?.blockedCount ?? 0) +
                  (draft.legacyUserPolicies?.exemptCount ?? 0) >
                0 ? (
                  <div className="legacy-policy-warning">
                    <div>
                      <strong>{t('automod.legacyPoliciesTitle')}</strong>
                      <span>
                        {t('automod.legacyPoliciesBody', {
                          count:
                            (draft.legacyUserPolicies?.blockedCount ?? 0) +
                            (draft.legacyUserPolicies?.exemptCount ?? 0),
                        })}
                      </span>
                    </div>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={clearLegacyUserPolicies}
                    >
                      {t('automod.clearLegacyPolicies')}
                    </button>
                  </div>
                ) : null}
                <MultiSelectField
                  id="automod-blocked-roles"
                  label={t('automod.blockedRoles')}
                  help={t('automod.blockedRolesHelp')}
                  value={draft.automod.blockedRoleIds ?? []}
                  onChange={(value) => updateNested('automod', 'blockedRoleIds', value)}
                  options={allRoleOptions}
                  icon="role"
                />
                <MultiSelectField
                  id="automod-exempt-roles"
                  label={t('automod.exemptRoles')}
                  help={t('automod.exemptRolesHelp')}
                  value={draft.automod.exemptRoleIds ?? []}
                  onChange={(value) => updateNested('automod', 'exemptRoleIds', value)}
                  options={allRoleOptions}
                  icon="role"
                />
                <MultiSelectField
                  id="automod-exempt-channels"
                  label={t('automod.exemptChannels')}
                  help={t('automod.exemptChannelsHelp')}
                  value={draft.automod.exemptChannelIds ?? []}
                  onChange={(value) =>
                    updateNested('automod', 'exemptChannelIds', value)
                  }
                  options={channelOptions}
                  icon="hash"
                />
              </div>

              <div className={`inline-status ${automodActive ? 'enabled' : ''}`}>
                <span />
                <Icon name="shield" size={16} />
                {draft.automod.enabled
                  ? t('automod.engineRunning')
                  : t('automod.enginePaused')}
              </div>
              {!resources.capabilities.canManageMessages ||
              !resources.capabilities.canKickMembers ||
              !resources.capabilities.canModerateMembers ? (
                <div className="warning-banner">
                  <Icon name="alert" size={18} />
                  {t('automod.capabilityWarning')}
                </div>
              ) : null}
            </SettingSection>

            <SettingSection
              id="roles"
              active={activeSection === 'roles'}
              title={t('roles.title')}
              description={t('roles.description')}
            >
              <div className="settings-card">
                <SelectField
                  id="auto-role"
                  label={t('roles.autoRole')}
                  help={t('roles.autoRoleHelp')}
                  icon="role"
                  value={draft.autoRoleId}
                  onChange={(value) => updateField('autoRoleId', value)}
                  options={roleOptions}
                  disabled={!resources.capabilities.canManageRoles}
                />
                <SelectField
                  id="verification-role"
                  label={t('roles.verificationRole')}
                  help={t('roles.verificationRoleHelp')}
                  icon="role"
                  value={draft.verificationRoleId}
                  onChange={(value) => updateField('verificationRoleId', value)}
                  options={roleOptions}
                  disabled={!resources.capabilities.canManageRoles}
                />
                {!resources.capabilities.canManageRoles ? (
                  <div className="warning-banner">
                    <Icon name="alert" size={18} />
                    {t('roles.capabilityWarning')}
                  </div>
                ) : null}
              </div>

              <div className="settings-card reaction-card">
                <div className="subsection-heading">
                  <div>
                    <h3>{t('roles.reactionTitle')}</h3>
                    <p>{t('roles.reactionDescription')}</p>
                  </div>
                  <span className="count-pill">{draft.reactionRoles.length}</span>
                </div>

                {draft.reactionRoles.length ? (
                  <div className="mapping-list">
                    {draft.reactionRoles.map((mapping) => (
                      <div className="mapping-item" key={mapping.key}>
                        <span className="emoji-preview">{mapping.emoji}</span>
                        <div>
                          <strong>
                            <a
                              className="inline-link"
                              href={`https://discord.com/channels/${selectedGuild.id}/${mapping.channelId}/${mapping.messageId}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {t('roles.mappingDescription', {
                                emoji: mapping.emoji,
                                messageId: mapping.messageId,
                              })}
                            </a>
                          </strong>
                          <span>
                            {t('common.channelPrefix', {
                              name:
                                channelNames.get(mapping.channelId) ?? mapping.channelId,
                            })}
                            {t('common.separator')}
                            {t('common.rolePrefix', {
                              name: roleNames.get(mapping.roleId) ?? mapping.roleId,
                            })}
                          </span>
                        </div>
                        <button
                          className="button danger ghost"
                          type="button"
                          disabled={reactionPending}
                          onClick={() => removeReactionRole(mapping.key)}
                        >
                          <Icon name="trash" size={16} />
                          {t('common.remove')}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mapping-empty">
                    <Icon name="spark" />
                    <div>
                      <strong>{t('roles.emptyTitle')}</strong>
                      <span>{t('roles.emptyBody')}</span>
                    </div>
                  </div>
                )}

                <div className="reaction-mode-switch" role="tablist" aria-label={t('roles.sourceMode')}>
                  <button
                    className={reactionMode === 'existing' ? 'selected' : ''}
                    type="button"
                    role="tab"
                    aria-selected={reactionMode === 'existing'}
                    onClick={() => setReactionMode('existing')}
                  >
                    {t('roles.existingMessage')}
                  </button>
                  <button
                    className={reactionMode === 'embed' ? 'selected' : ''}
                    type="button"
                    role="tab"
                    aria-selected={reactionMode === 'embed'}
                    onClick={() => setReactionMode('embed')}
                  >
                    {t('roles.newEmbed')}
                  </button>
                </div>

                <form className="reaction-form reaction-form-v2" onSubmit={addReactionRole}>
                  {reactionMode === 'existing' ? (
                    <div className="compact-field reaction-wide-field">
                      <label htmlFor="reaction-message-link">{t('roles.messageLink')}</label>
                      <input
                        id="reaction-message-link"
                        required
                        type="url"
                        maxLength="256"
                        value={reactionForm.messageLink}
                        placeholder={t('roles.messageLinkPlaceholder')}
                        onChange={(event) =>
                          setReactionForm((current) => ({
                            ...current,
                            messageLink: event.target.value,
                          }))
                        }
                      />
                      <small>{t('roles.messageLinkHelp')}</small>
                    </div>
                  ) : (
                    <>
                      <div className="compact-field reaction-wide-field">
                        <label htmlFor="reaction-channel">{t('roles.channel')}</label>
                        <Select
                          id="reaction-channel"
                          label={t('roles.channel')}
                          required
                          value={reactionForm.channelId}
                          onChange={(channelId) =>
                            setReactionForm((current) => ({
                              ...current,
                              channelId,
                            }))
                          }
                          options={channelOptions}
                          placeholder={t('common.chooseChannel')}
                          icon="hash"
                          variant="compact-select"
                        />
                      </div>
                      <div className="compact-field reaction-wide-field">
                        <label htmlFor="reaction-content">{t('embeds.content')}</label>
                        <textarea
                          id="reaction-content"
                          maxLength="2000"
                          rows="2"
                          value={reactionForm.content}
                          placeholder={t('embeds.contentPlaceholder')}
                          onChange={(event) =>
                            setReactionForm((current) => ({
                              ...current,
                              content: event.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="reaction-wide-field">
                        <EmbedBuilder
                          value={reactionForm.embed}
                          onChange={(embed) =>
                            setReactionForm((current) => ({ ...current, embed }))
                          }
                        />
                      </div>
                    </>
                  )}

                  <div className="compact-field reaction-wide-field">
                    <label htmlFor="reaction-role">{t('roles.role')}</label>
                    <Select
                      id="reaction-role"
                      label={t('roles.role')}
                      required
                      value={reactionForm.roleId}
                      onChange={(roleId) =>
                        setReactionForm((current) => ({
                          ...current,
                          roleId,
                        }))
                      }
                      options={roleOptions}
                      placeholder={t('common.none')}
                      icon="role"
                      variant="compact-select"
                    />
                  </div>

                  <div className="compact-field reaction-wide-field">
                    <label htmlFor="reaction-emoji-search">{t('roles.emoji')}</label>
                    <EmojiPicker
                      id="reaction-emoji-search"
                      value={reactionForm.emoji}
                      onChange={(emoji) =>
                        setReactionForm((current) => ({ ...current, emoji }))
                      }
                    />
                  </div>

                  <button
                    className="button primary reaction-submit"
                    type="submit"
                    disabled={
                      reactionPending ||
                      !resources.capabilities.canManageRoles ||
                      !roleOptions.length ||
                      (reactionMode === 'embed' && !reactionForm.channelId) ||
                      (reactionMode === 'existing' && !reactionForm.messageLink)
                    }
                  >
                    <Icon name="spark" size={17} />
                    {reactionPending
                      ? t('common.adding')
                      : reactionMode === 'embed'
                        ? t('roles.publishAndCreate')
                        : t('common.add')}
                  </button>
                </form>
              </div>
            </SettingSection>

            <SettingSection
              id="embeds"
              active={activeSection === 'embeds'}
              title={t('embeds.title')}
              description={t('embeds.description')}
            >
              <form className="settings-card embed-publisher" onSubmit={publishEmbed}>
                <div className="embed-publisher-top">
                  <SelectField
                    id="embed-channel"
                    label={t('embeds.channel')}
                    help={t('embeds.channelHelp')}
                    icon="hash"
                    value={embedForm.channelId}
                    onChange={(channelId) =>
                      setEmbedForm((current) => ({ ...current, channelId }))
                    }
                    options={channelOptions}
                  />
                  <InputField
                    id="embed-content"
                    label={t('embeds.content')}
                    help={t('embeds.contentHelp')}
                    value={embedForm.content}
                    onChange={(value) =>
                      setEmbedForm((current) => ({ ...current, content: value }))
                    }
                    maxLength={2000}
                    multiline
                    placeholder={t('embeds.contentPlaceholder')}
                  />
                </div>
                <div className="embed-publisher-builder">
                  <EmbedBuilder
                    value={embedForm.embed}
                    onChange={(embed) =>
                      setEmbedForm((current) => ({ ...current, embed }))
                    }
                  />
                </div>
                <div className="embed-publisher-actions">
                  <button
                    className="button primary"
                    type="submit"
                    disabled={embedPending || !embedForm.channelId}
                  >
                    <Icon name="message" size={17} />
                    {embedPending ? t('common.saving') : t('embeds.publish')}
                  </button>
                  {lastPublishedEmbed?.messageLink ? (
                    <a
                      className="button secondary"
                      href={lastPublishedEmbed.messageLink}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t('embeds.openMessage')}
                      <Icon name="external" size={16} />
                    </a>
                  ) : null}
                </div>
              </form>
            </SettingSection>

            <SettingSection
              id="community"
              active={activeSection === 'community'}
              title={t('community.title')}
              description={t('community.description')}
            >
              <div className="settings-card">
                <SelectField
                  id="suggestion-channel"
                  label={t('suggestions.channel')}
                  help={t('suggestions.channelHelp')}
                  icon="hash"
                  value={draft.suggestionsChannelId}
                  onChange={(value) => updateField('suggestionsChannelId', value)}
                  options={channelOptions}
                />
                <SelectField
                  id="giveaway-channel"
                  label={t('community.giveawayChannel')}
                  help={t('community.giveawayChannelHelp')}
                  icon="hash"
                  value={draft.giveawayChannelId}
                  onChange={(value) => updateField('giveawayChannelId', value)}
                  options={channelOptions}
                />
                <InputField
                  id="giveaway-duration"
                  label={t('community.giveawayDuration')}
                  help={t('community.giveawayDurationHelp')}
                  type="number"
                  min={10}
                  max={604800}
                  value={draft.giveaways.defaultDurationSeconds}
                  onChange={(value) =>
                    updateNested('giveaways', 'defaultDurationSeconds', value)
                  }
                />
                <SelectField
                  id="ticket-category"
                  label={t('community.ticketCategory')}
                  help={t('community.ticketCategoryHelp')}
                  icon="grid"
                  value={draft.ticketCategoryId}
                  onChange={(value) => updateField('ticketCategoryId', value)}
                  options={categoryOptions}
                />
                {!resources.capabilities.canManageChannels ? (
                  <div className="warning-banner">
                    <Icon name="alert" size={18} />
                    {t('community.ticketCapabilityWarning')}
                  </div>
                ) : null}
              </div>
              {[
                ['welcome', 'community.welcome'],
                ['goodbye', 'community.goodbye'],
              ].map(([section, prefix]) => (
                <div className="settings-card" key={section}>
                  <ToggleField
                    id={`${section}-enabled`}
                    label={t(`${prefix}Title`)}
                    help={t(`${prefix}Help`)}
                    checked={draft[section].enabled}
                    onChange={(value) => updateNested(section, 'enabled', value)}
                  />
                  <SelectField
                    id={`${section}-channel`}
                    label={t(`${prefix}Channel`)}
                    help={t('community.lifecycleChannelHelp')}
                    icon="hash"
                    value={draft[section].channelId}
                    onChange={(value) => updateNested(section, 'channelId', value)}
                    options={channelOptions}
                  />
                  <InputField
                    id={`${section}-message`}
                    label={t(`${prefix}Message`)}
                    help={t('community.lifecycleMessageHelp')}
                    value={draft[section].message}
                    onChange={(value) => updateNested(section, 'message', value)}
                    maxLength={1900}
                    multiline
                    placeholder={t(`${prefix}Placeholder`)}
                  />
                </div>
              ))}
            </SettingSection>

            <SettingSection
              id="automation"
              active={activeSection === 'automation'}
              title={t('automation.title')}
              description={t('automation.description')}
            >
              <div className="settings-card automation-card">
                <div className="subsection-heading page-card-heading">
                  <div>
                    <h3>{t('automation.autoresponderTitle')}</h3>
                    <p>{t('automation.autoresponderDescription')}</p>
                  </div>
                  <span className="count-pill">{draft.autoresponders.length}</span>
                </div>

                {draft.autoresponders.length ? (
                  <div className="automation-list">
                    {draft.autoresponders.map((entry) => (
                      <article className="automation-item" key={entry.id}>
                        <button
                          className={entry.enabled ? 'status-dot enabled' : 'status-dot'}
                          type="button"
                          aria-label={
                            entry.enabled
                              ? t('automation.disableResponder')
                              : t('automation.enableResponder')
                          }
                          onClick={() =>
                            updateAutoresponder(entry.id, {
                              enabled: !entry.enabled,
                            })
                          }
                        />
                        <div>
                          <strong>{entry.trigger}</strong>
                          <span>
                            {entry.match === 'exact'
                              ? t('automation.exactMatch')
                              : t('automation.containsMatch')}
                          </span>
                          <p>{entry.response}</p>
                        </div>
                        <button
                          className="button danger ghost"
                          type="button"
                          onClick={() => removeAutoresponder(entry.id)}
                        >
                          <Icon name="trash" size={15} />
                          {t('common.remove')}
                        </button>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="mapping-empty">
                    <Icon name="message" />
                    <div>
                      <strong>{t('automation.autoresponderEmpty')}</strong>
                      <span>{t('automation.autoresponderEmptyHelp')}</span>
                    </div>
                  </div>
                )}

                <form className="autoresponder-form" onSubmit={addAutoresponder}>
                  <div className="compact-field">
                    <label htmlFor="autoresponder-trigger">
                      {t('automation.trigger')}
                    </label>
                    <input
                      id="autoresponder-trigger"
                      required
                      maxLength="100"
                      value={autoresponderForm.trigger}
                      placeholder={t('automation.triggerPlaceholder')}
                      onChange={(event) =>
                        setAutoresponderForm((current) => ({
                          ...current,
                          trigger: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="compact-field">
                    <label htmlFor="autoresponder-match">
                      {t('automation.matchMode')}
                    </label>
                    <Select
                      id="autoresponder-match"
                      label={t('automation.matchMode')}
                      value={autoresponderForm.match}
                      onChange={(match) =>
                        setAutoresponderForm((current) => ({
                          ...current,
                          match,
                        }))
                      }
                      options={[
                        { id: 'contains', label: t('automation.containsMatch') },
                        { id: 'exact', label: t('automation.exactMatch') },
                      ]}
                    />
                  </div>
                  <div className="compact-field autoresponder-response">
                    <label htmlFor="autoresponder-response">
                      {t('automation.response')}
                    </label>
                    <textarea
                      id="autoresponder-response"
                      required
                      maxLength="1900"
                      rows="3"
                      value={autoresponderForm.response}
                      placeholder={t('automation.responsePlaceholder')}
                      onChange={(event) =>
                        setAutoresponderForm((current) => ({
                          ...current,
                          response: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <button className="button primary" type="submit">
                    <Icon name="spark" size={16} />
                    {t('automation.addResponder')}
                  </button>
                </form>
              </div>

              <div className="settings-card automation-card">
                <div className="subsection-heading page-card-heading">
                  <div>
                    <h3>{t('automation.starboardTitle')}</h3>
                    <p>{t('automation.starboardDescription')}</p>
                  </div>
                </div>
                <ToggleField
                  id="starboard-enabled"
                  label={t('automation.starboardEnabled')}
                  help={t('automation.starboardEnabledHelp')}
                  checked={draft.starboard.enabled}
                  onChange={(value) => updateNested('starboard', 'enabled', value)}
                />
                <SelectField
                  id="starboard-channel"
                  label={t('automation.starboardChannel')}
                  help={t('automation.starboardChannelHelp')}
                  icon="hash"
                  value={draft.starboard.channelId}
                  onChange={(value) => updateNested('starboard', 'channelId', value)}
                  options={channelOptions}
                />
                <InputField
                  id="starboard-threshold"
                  label={t('automation.starboardThreshold')}
                  help={t('automation.starboardThresholdHelp')}
                  type="number"
                  min={1}
                  max={100}
                  value={draft.starboard.threshold}
                  onChange={(value) => updateNested('starboard', 'threshold', value)}
                />
                <div className="field-row input-field-row">
                  <div className="field-copy">
                    <label htmlFor="starboard-emoji">
                      {t('automation.starboardEmoji')}
                    </label>
                    <p>{t('automation.starboardEmojiHelp')}</p>
                  </div>
                  <EmojiPicker
                    id="starboard-emoji"
                    value={draft.starboard.emoji}
                    onChange={(value) => updateNested('starboard', 'emoji', value)}
                  />
                </div>
                <MultiSelectField
                  id="starboard-ignore-channels"
                  label={t('automation.starboardIgnoredChannels')}
                  help={t('automation.starboardIgnoredChannelsHelp')}
                  value={draft.starboard.ignoreChannelIds}
                  onChange={(value) =>
                    updateNested('starboard', 'ignoreChannelIds', value)
                  }
                  options={channelOptions}
                  icon="hash"
                />
              </div>
            </SettingSection>

            <SettingSection
              id="economy"
              active={activeSection === 'economy'}
              title={t('economy.title')}
              description={t('economy.description')}
            >
              <div className="settings-card">
                <InputField
                  id="currency"
                  label={t('economy.currency')}
                  help={t('economy.currencyHelp')}
                  value={draft.currency}
                  onChange={(value) => updateField('currency', value)}
                  maxLength={24}
                  placeholder={t('economy.currencyPlaceholder')}
                />
                {[
                  ['begReward', 'economy.begReward'],
                  ['dailyReward', 'economy.dailyReward'],
                  ['weeklyReward', 'economy.weeklyReward'],
                  ['boxPrice', 'economy.boxPrice'],
                ].map(([field, key]) => (
                  <InputField
                    id={`economy-${field}`}
                    key={field}
                    label={t(key)}
                    help={t(`${key}Help`)}
                    type="number"
                    min={1}
                    max={2000000000}
                    value={draft.economy[field]}
                    onChange={(value) => updateNested('economy', field, value)}
                  />
                ))}
                <InputField
                  id="robbery-success"
                  label={t('economy.robberySuccess')}
                  help={t('economy.robberySuccessHelp')}
                  type="number"
                  min={0}
                  max={100}
                  value={draft.economy.robberySuccessPercent}
                  onChange={(value) =>
                    updateNested('economy', 'robberySuccessPercent', value)
                  }
                />
              </div>
            </SettingSection>

            <SettingSection
              id="music"
              active={activeSection === 'music'}
              title={t('music.title')}
              description={t('music.description')}
            >
              <div className="settings-card">
                <InputField
                  id="music-volume"
                  label={t('music.defaultVolume')}
                  help={t('music.defaultVolumeHelp')}
                  type="number"
                  min={1}
                  max={200}
                  value={draft.music.defaultVolume}
                  onChange={(value) => updateNested('music', 'defaultVolume', value)}
                />
              </div>
            </SettingSection>

            <SettingSection
              id="modules"
              active={activeSection === 'modules'}
              title={t('modules.title')}
              description={t('modules.description')}
            >
              <div className="settings-card module-grid">
                <ToggleField
                  id="ai-chat"
                  label={t('modules.ai')}
                  help={t('modules.aiHelp')}
                  checked={draft.aiChatEnabled}
                  onChange={(value) => updateField('aiChatEnabled', value)}
                />
                {Object.keys(draft.modules).map((module) => (
                  <ToggleField
                    id={`module-${module}`}
                    key={module}
                    label={t(`modules.${module}`)}
                    help={t('modules.moduleHelp', {
                      module: t(`modules.${module}`),
                    })}
                    checked={draft.modules[module]}
                    onChange={(value) => updateNested('modules', module, value)}
                  />
                ))}
              </div>

              <div className="settings-card command-manager">
                <div className="subsection-heading page-card-heading">
                  <div>
                    <h3>{t('modules.commandManagerTitle')}</h3>
                    <p>{t('modules.commandManagerDescription')}</p>
                  </div>
                  <input
                    className="command-search"
                    value={commandQuery}
                    placeholder={t('modules.commandSearch')}
                    onChange={(event) => setCommandQuery(event.target.value)}
                  />
                </div>
                <div className="command-manager-list">
                  {visibleCommands.map((command) => {
                    const enabled = !draft.disabledCommands.includes(command.name);
                    return (
                      <div className="command-manager-item" key={command.name}>
                        <div>
                          <strong>/{command.name}</strong>
                          <span>{command.description}</span>
                        </div>
                        <button
                          id={`command-${command.name}`}
                          className={enabled ? 'toggle checked' : 'toggle'}
                          type="button"
                          role="switch"
                          aria-checked={enabled}
                          onClick={() =>
                            updateField(
                              'disabledCommands',
                              enabled
                                ? [...draft.disabledCommands, command.name]
                                : draft.disabledCommands.filter(
                                    (name) => name !== command.name,
                                  ),
                            )
                          }
                        >
                          <span>{enabled ? t('common.on') : t('common.off')}</span>
                          <i />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </SettingSection>

            <SettingSection
              id="custom"
              active={activeSection === 'custom'}
              title={t('custom.title')}
              description={t('custom.description')}
            >
              <div className="settings-card reaction-card">
                <div className="subsection-heading">
                  <div>
                    <h3>{t('custom.library')}</h3>
                    <p>{t('custom.libraryHelp')}</p>
                  </div>
                  <span className="count-pill">
                    {Object.keys(draft.customCommands).length}
                  </span>
                </div>
                {Object.keys(draft.customCommands).length ? (
                  <div className="mapping-list">
                    {Object.entries(draft.customCommands).map(([name, response]) => (
                      <div className="mapping-item custom-command-item" key={name}>
                        <span className="command-glyph">/</span>
                        <div>
                          <strong>{name}</strong>
                          <span>{response}</span>
                        </div>
                        <button
                          className="button danger ghost"
                          type="button"
                          onClick={() => removeCustomCommand(name)}
                        >
                          <Icon name="trash" size={16} />
                          {t('common.remove')}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mapping-empty">
                    <Icon name="terminal" />
                    <div>
                      <strong>{t('custom.emptyTitle')}</strong>
                      <span>{t('custom.emptyBody')}</span>
                    </div>
                  </div>
                )}
                <form className="custom-command-form" onSubmit={saveCustomCommand}>
                  <div className="compact-field">
                    <label htmlFor="custom-name">{t('custom.name')}</label>
                    <input
                      id="custom-name"
                      required
                      maxLength="32"
                      pattern="[a-z0-9-]{1,32}"
                      value={customForm.name}
                      placeholder={t('custom.namePlaceholder')}
                      onChange={(event) =>
                        setCustomForm((current) => ({
                          ...current,
                          name: event.target.value
                            .toLocaleLowerCase('en-US')
                            .replace(/[^a-z0-9-]/gu, ''),
                        }))
                      }
                    />
                  </div>
                  <div className="compact-field custom-response-field">
                    <label htmlFor="custom-response">{t('custom.response')}</label>
                    <textarea
                      id="custom-response"
                      required
                      maxLength="1900"
                      value={customForm.response}
                      placeholder={t('custom.responsePlaceholder')}
                      onChange={(event) =>
                        setCustomForm((current) => ({
                          ...current,
                          response: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <button className="button secondary" type="submit">
                    <Icon name="spark" size={17} />
                    {t('custom.stage')}
                  </button>
                </form>
              </div>
            </SettingSection>
          </div>
        ) : null}
      </main>

      {toast ? (
        <Toast
          key={toast.id}
          type={toast.type}
          message={toast.message}
          duration={toast.duration}
          onDismiss={dismissToast}
        />
      ) : null}
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined);
  const [loginError, setLoginError] = useState(null);

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const oauthError = parameters.get('error');
    if (oauthError) {
      setLoginError(translatedError(new ApiError(oauthError)));
      window.history.replaceState({}, '', window.location.pathname);
    }

    api('/api/session')
      .then((result) => {
        if (!result.authenticated && window.location.pathname !== '/') {
          window.history.replaceState({}, '', '/');
        }
        setSession(result);
      })
      .catch((error) => {
        setLoginError(translatedError(error));
        window.history.replaceState({}, '', '/');
        setSession({ authenticated: false });
      });
  }, []);

  const expireSession = useCallback((error) => {
    window.history.replaceState({}, '', '/');
    setSession({ authenticated: false });
    if (error) setLoginError(translatedError(error));
  }, []);

  if (session === undefined) return <Loading />;
  if (!session.authenticated)
    return <Login error={loginError} onDismiss={() => setLoginError(null)} />;
  return <Dashboard session={session} onSessionExpired={expireSession} />;
}
