import { useEffect, useRef, useState } from 'react';
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  TextField,
  Tooltip,
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
    if (palette) window.setTimeout(() => search.current?.focus(), 0);
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

  const entry = ([id, key, icon]) => {
    const pinned = pins.includes(id);
    return (
      <Box className="nav-entry" key={id}>
        <ListItemButton
          className="nav-page-button"
          selected={active === id}
          aria-current={active === id ? 'page' : undefined}
          data-section={id}
          onClick={() => onNavigate(id)}
        >
          <ListItemIcon className="nav-page-icon">
            <Icon name={icon} size={19} />
          </ListItemIcon>
          <ListItemText
            className="nav-page-text"
            primary={t(key)}
            primaryTypographyProps={{ noWrap: true }}
          />
        </ListItemButton>
        <Tooltip
          title={t(pinned ? 'navigation.unpin' : 'navigation.pin')}
          placement="right"
        >
          <IconButton
            size="small"
            className={`nav-pin ${pinned ? 'pinned' : ''}`}
            aria-label={t(pinned ? 'navigation.unpin' : 'navigation.pin')}
            aria-pressed={pinned}
            onClick={() => pin(id)}
          >
            {pinned ? '★' : '☆'}
          </IconButton>
        </Tooltip>
      </Box>
    );
  };

  return (
    <>
      <Box className="sidebar-search-row">
        <TextField
          className="sidebar-search mui-sidebar-search"
          size="small"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('navigation.search')}
          aria-label={t('navigation.search')}
          slotProps={{
            input: {
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title={t('navigation.palette')}>
                    <IconButton
                      size="small"
                      className="command-palette-button"
                      aria-label={t('navigation.palette')}
                      onClick={() => setPalette(true)}
                    >
                      <kbd>Ctrl K</kbd>
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              ),
            },
          }}
        />
      </Box>

      <List
        component="nav"
        className="sidebar-navigation"
        disablePadding
        aria-label={t('navigation.palette')}
      >
        {pins.length && matches.some(([id]) => pins.includes(id)) ? (
          <Box component="li" className="nav-group">
            <ListSubheader disableSticky className="nav-group-label">
              {t('navigation.pinned')}
            </ListSubheader>
            {matches.filter(([id]) => pins.includes(id)).map(entry)}
          </Box>
        ) : null}

        {Object.entries(GROUPS).map(([group, pages]) => {
          const groupItems = matches.filter(([id]) => pages.includes(id));
          if (!groupItems.length) return null;
          return (
            <Box component="li" className="nav-group" key={group}>
              <ListSubheader disableSticky className="nav-group-label">
                {t(`navigation.${group}`)}
              </ListSubheader>
              {groupItems.map(entry)}
            </Box>
          );
        })}
      </List>

      <Dialog
        open={palette}
        onClose={() => setPalette(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{t('navigation.palette')}</DialogTitle>
        <DialogContent>
          <TextField
            inputRef={search}
            autoFocus
            fullWidth
            aria-label={t('platform.search')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('navigation.search')}
            sx={{ mt: 0.5, mb: 1.5 }}
          />
          <List className="palette-results" disablePadding>
            {matches.map(([id, label, icon]) => (
              <ListItemButton
                key={id}
                onClick={() => {
                  setPalette(false);
                  onNavigate(id);
                }}
              >
                <ListItemIcon>
                  <Icon name={icon} size={18} />
                </ListItemIcon>
                <ListItemText primary={t(label)} />
              </ListItemButton>
            ))}
            {results.map((result) => (
              <ListItemButton
                key={result.id}
                onClick={() => {
                  setPalette(false);
                  onNavigate(featurePages[result.kind] ?? result.kind, result.id);
                }}
              >
                <ListItemText
                  primary={result.name}
                  secondary={t(`feature.${result.kind}.title`)}
                />
              </ListItemButton>
            ))}
          </List>
        </DialogContent>
      </Dialog>
    </>
  );
}
