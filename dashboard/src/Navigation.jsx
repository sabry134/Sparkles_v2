import { useEffect, useRef, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
} from '@mui/material';
import { t } from './i18n/index.js';
import { api } from './api.js';
import Icon from './Icon.jsx';

const GROUPS = {
  overview: ['overview', 'members', 'activity', 'jobs'],
  moderation: ['moderation', 'automod', 'rules'],
  community: [
    'roles',
    'community',
    'tickets',
    'forms',
    'giveaways',
    'polls',
    'economy',
    'music',
  ],
  messages: ['embeds', 'automation', 'custom', 'feeds'],
  configuration: ['modules', 'access', 'blueprints'],
};

const featurePages = {
  messages: 'embeds',
  'automod-rules': 'automod',
  'role-panels': 'roles',
  workflows: 'automation',
  commands: 'custom',
  'ticket-panels': 'tickets',
};

export default function Navigation({ items, active, onNavigate, guildId }) {
  const [query, setQuery] = useState('');
  const [palette, setPalette] = useState(false);
  const [results, setResults] = useState([]);
  const search = useRef(null);
  const [pins, setPins] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('sparkles.pinnedPages') ?? '[]');
      return Array.isArray(saved)
        ? saved.filter((item) => items.some(([id]) => id === item))
        : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const listener = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setPalette((value) => !value);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  useEffect(() => {
    if (palette) {
      window.setTimeout(() => search.current?.focus(), 0);
    }
  }, [palette]);

  useEffect(() => {
    if (!palette || !query.trim() || !guildId) {
      setResults([]);
      return undefined;
    }

    let current = true;
    const timer = setTimeout(
      () =>
        api(
          `/api/guilds/${guildId}/platform/search?q=${encodeURIComponent(query)}`,
        )
          .then((result) => {
            if (current) setResults(result.items);
          })
          .catch(() => {
            if (current) setResults([]);
          }),
      300,
    );

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [palette, query, guildId]);

  const pin = (page) => {
    const next = pins.includes(page)
      ? pins.filter((id) => id !== page)
      : [...pins, page];
    setPins(next);
    try {
      localStorage.setItem('sparkles.pinnedPages', JSON.stringify(next));
    } catch {}
  };

  const matches = items.filter(([, label]) =>
    t(label).toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );

  const entry = ([id, key, icon]) => (
    <div className="nav-entry" key={id}>
      <Button
        className="nav-page-button"
        aria-current={active === id ? 'page' : undefined}
        data-section={id}
        onClick={() => onNavigate(id)}
        startIcon={<Icon name={icon} />}
      >
        {t(key)}
      </Button>
      <IconButton
        size="small"
        className="nav-pin"
        aria-label={t(pins.includes(id) ? 'navigation.unpin' : 'navigation.pin')}
        aria-pressed={pins.includes(id)}
        onClick={() => pin(id)}
      >
        ☆
      </IconButton>
    </div>
  );

  return (
    <>
      <TextField
        className="sidebar-search mui-sidebar-search"
        size="small"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t('navigation.search')}
        aria-label={t('navigation.search')}
      />
      <Button
        variant="outlined"
        className="sidebar-search palette-trigger"
        onClick={() => setPalette(true)}
      >
        {t('navigation.palette')} <kbd>Ctrl K</kbd>
      </Button>

      <nav>
        {pins.length ? (
          <>
            <p className="nav-group-label">{t('navigation.pinned')}</p>
            {matches.filter(([id]) => pins.includes(id)).map(entry)}
          </>
        ) : null}

        {Object.entries(GROUPS).map(([group, pages]) => (
          <div key={group}>
            {matches.some(([id]) => pages.includes(id)) ? (
              <p className="nav-group-label">{t(`navigation.${group}`)}</p>
            ) : null}
            {matches.filter(([id]) => pages.includes(id)).map(entry)}
          </div>
        ))}
      </nav>

      <Dialog
        open={palette}
        onClose={() => setPalette(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{t('navigation.palette')}</DialogTitle>
        <DialogContent>
          <p>{t('navigation.paletteHelp')}</p>
          <TextField
            inputRef={search}
            autoFocus
            fullWidth
            className="palette-search"
            aria-label={t('platform.search')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('navigation.search')}
            sx={{ mb: 2 }}
          />
          <div className="palette-results mui-palette-results">
            {matches.map(([id, label]) => (
              <Button
                fullWidth
                key={id}
                onClick={() => {
                  setPalette(false);
                  onNavigate(id);
                }}
              >
                {t(label)}
              </Button>
            ))}
            {results.map((result) => (
              <Button
                fullWidth
                key={result.id}
                onClick={() => {
                  setPalette(false);
                  onNavigate(featurePages[result.kind] ?? result.kind, result.id);
                }}
              >
                <span>
                  {result.name}
                  <small>{t(`feature.${result.kind}.title`)}</small>
                </span>
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
