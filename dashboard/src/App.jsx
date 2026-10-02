import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from './api.js';
import { t } from './i18n/index.js';
import Icon from './Icon.jsx';
import Select from './Select.jsx';

const NAVIGATION = [
  ['overview', 'nav.overview', 'grid'],
  ['moderation', 'nav.moderation', 'shield'],
  ['automod', 'nav.automod', 'spark'],
  ['roles', 'nav.roles', 'users'],
  ['community', 'nav.community', 'message'],
  ['economy', 'nav.economy', 'coin'],
  ['music', 'nav.music', 'music'],
  ['modules', 'nav.modules', 'settings'],
  ['custom', 'nav.custom', 'terminal'],
];

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

function SettingSection({ id, title, description, children }) {
  return (
    <section className="settings-section" id={id}>
      <header className="section-heading">
        <h2>{title}</h2>
        <p>{description}</p>
      </header>
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

function SnowflakeListField({ id, label, help, value, onChange }) {
  const [input, setInput] = useState('');

  function add() {
    const normalized = input.trim();
    if (!/^\d{17,20}$/u.test(normalized) || value.includes(normalized)) return;
    onChange([...value, normalized]);
    setInput('');
  }

  return (
    <div className="field-row input-field-row">
      <div className="field-copy">
        <label htmlFor={id}>{label}</label>
        <p>{help}</p>
      </div>
      <div className="list-editor">
        <div className="list-editor-add">
          <input
            id={id}
            inputMode="numeric"
            pattern="[0-9]{17,20}"
            maxLength="20"
            value={input}
            placeholder={t('automod.userIdPlaceholder')}
            onChange={(event) => setInput(event.target.value.replace(/\D/gu, ''))}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                add();
              }
            }}
          />
          <button
            className="button secondary"
            type="button"
            disabled={!/^\d{17,20}$/u.test(input) || value.includes(input)}
            onClick={add}
          >
            {t('common.addItem')}
          </button>
        </div>
        {value.length ? (
          <div className="token-list">
            {value.map((item) => (
              <span className="token-item" key={item}>
                <span>{item}</span>
                <button
                  type="button"
                  aria-label={t('common.removeItem', { item })}
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
  const [reactionForm, setReactionForm] = useState({
    channelId: '',
    messageId: '',
    emoji: '',
    roleId: '',
  });
  const [customForm, setCustomForm] = useState({ name: '', response: '' });
  const [activeSection, setActiveSection] = useState('overview');
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
        ['AUTH_REQUIRED', 'DISCORD_SESSION_EXPIRED'].includes(error.code)
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
        const remembered = rememberedGuild();
        const selected =
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
  const sectionsReady = Boolean(draft && resources);

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
    if (loadingSettings || settingsError || !sectionsReady) return;
    const sections = NAVIGATION.map(([id]) => document.getElementById(id)).filter(Boolean);
    if (!sections.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
        if (visible) setActiveSection(visible.target.id);
      },
      {
        rootMargin: '-18% 0px -68% 0px',
        threshold: [0, 0.2, 0.5, 0.8],
      },
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [selectedGuildId, loadingSettings, settingsError, sectionsReady]);

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
            modules: settings.modules,
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

  function chooseGuild(value) {
    activeGuildId.current = value;
    setSelectedGuildId(value);
    setActiveSection('overview');
    setToast(null);
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
      const result = await api(`/api/guilds/${selectedGuild.id}/reaction-roles`, {
        method: 'POST',
        csrfToken: session.csrfToken,
        body: reactionForm,
      });
      mergeReactionSettings(result.settings);
      setReactionForm({ channelId: '', messageId: '', emoji: '', roleId: '' });
      showSuccess(t('status.reactionAdded'));
    } catch (error) {
      showError(error);
    } finally {
      setReactionPending(false);
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
              onClick={() => {
                setActiveSection(id);
                document.getElementById(id)?.scrollIntoView({ behavior: scrollBehavior() });
              }}
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
                  <p className="eyebrow">{t('header.serverSettings')}</p>
                  <h1>{t('header.title', { server: selectedGuild.name })}</h1>
                  <p>{t('header.description')}</p>
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
            </SettingSection>

            <SettingSection
              id="automod"
              title={t('automod.title')}
              description={t('automod.description')}
            >
              {(draft.automod.exemptUserIds ?? []).includes(session.user.id) ? (
                <div className="warning-banner automod-self-exempt">
                  <Icon name="alert" size={18} />
                  <span>{t('automod.currentUserExempt')}</span>
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() =>
                      updateNested(
                        'automod',
                        'exemptUserIds',
                        (draft.automod.exemptUserIds ?? []).filter(
                          (userId) => userId !== session.user.id,
                        ),
                      )
                    }
                  >
                    {t('automod.removeMyExemption')}
                  </button>
                </div>
              ) : null}

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
                <SnowflakeListField
                  id="automod-blacklisted-users"
                  label={t('automod.blacklistedUsers')}
                  help={t('automod.blacklistedUsersHelp')}
                  value={draft.automod.blacklistedUserIds ?? []}
                  onChange={(value) =>
                    updateNested('automod', 'blacklistedUserIds', value)
                  }
                />
                <SnowflakeListField
                  id="automod-exempt-users"
                  label={t('automod.exemptUsers')}
                  help={t('automod.exemptUsersHelp')}
                  value={draft.automod.exemptUserIds ?? []}
                  onChange={(value) => updateNested('automod', 'exemptUserIds', value)}
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

              <div
                className={`inline-status ${
                  draft.automod.enabled &&
                  (draft.automod.antiLink ||
                    draft.automod.antiSwear ||
                    draft.automod.antiSpam ||
                    draft.automod.antiMentionSpam ||
                    draft.automod.antiCaps ||
                    draft.automod.antiEmojiSpam ||
                    draft.automod.antiAttachmentSpam ||
                    draft.automod.antiLinkSpam)
                    ? 'enabled'
                    : ''
                }`}
              >
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
                            {t('roles.mappingDescription', {
                              emoji: mapping.emoji,
                              messageId: mapping.messageId,
                            })}
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

                <form className="reaction-form" onSubmit={addReactionRole}>
                  <div className="compact-field">
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
                  <div className="compact-field">
                    <label htmlFor="reaction-message">{t('roles.messageId')}</label>
                    <input
                      id="reaction-message"
                      required
                      minLength="17"
                      maxLength="20"
                      inputMode="numeric"
                      pattern="[0-9]{17,20}"
                      value={reactionForm.messageId}
                      placeholder={t('roles.messageIdPlaceholder')}
                      onChange={(event) =>
                        setReactionForm((current) => ({
                          ...current,
                          messageId: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="compact-field">
                    <label htmlFor="reaction-emoji">{t('roles.emoji')}</label>
                    <input
                      id="reaction-emoji"
                      required
                      maxLength="64"
                      value={reactionForm.emoji}
                      placeholder={t('roles.emojiPlaceholder')}
                      onChange={(event) =>
                        setReactionForm((current) => ({
                          ...current,
                          emoji: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="compact-field">
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
                  <button
                    className="button secondary reaction-submit"
                    type="submit"
                    disabled={
                      reactionPending ||
                      !resources.capabilities.canManageRoles ||
                      !channelOptions.length ||
                      !roleOptions.length
                    }
                  >
                    <Icon name="spark" size={17} />
                    {reactionPending ? t('common.adding') : t('common.add')}
                  </button>
                </form>
              </div>
            </SettingSection>

            <SettingSection
              id="community"
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
              id="economy"
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
            </SettingSection>

            <SettingSection
              id="custom"
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
      .then(setSession)
      .catch((error) => {
        setLoginError(translatedError(error));
        setSession({ authenticated: false });
      });
  }, []);

  const expireSession = useCallback((error) => {
    setSession({ authenticated: false });
    if (error) setLoginError(translatedError(error));
  }, []);

  if (session === undefined) return <Loading />;
  if (!session.authenticated)
    return <Login error={loginError} onDismiss={() => setLoginError(null)} />;
  return <Dashboard session={session} onSessionExpired={expireSession} />;
}
