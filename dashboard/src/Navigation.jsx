import { useEffect, useRef, useState } from 'react';
import { t } from './i18n/index.js';
import { api } from './api.js';
import Icon from './Icon.jsx';

const GROUPS = {
  overview: ['overview', 'members', 'activity', 'jobs'],
  moderation: ['moderation', 'automod', 'rules'],
  community: ['roles', 'community', 'tickets', 'forms', 'giveaways', 'polls', 'economy', 'music'],
  messages: ['embeds', 'automation', 'custom', 'feeds'],
  configuration: ['modules', 'access', 'blueprints'],
};
const featurePages = { messages: 'embeds', 'automod-rules': 'automod', 'role-panels': 'roles', workflows: 'automation', commands: 'custom', 'ticket-panels': 'tickets' };

export default function Navigation({ items, active, onNavigate, guildId }) {
  const [query, setQuery] = useState(''); const [palette, setPalette] = useState(false); const [results, setResults] = useState([]);
  const [pins, setPins] = useState(() => { try { const saved = JSON.parse(localStorage.getItem('sparkles.pinnedPages') ?? '[]'); return Array.isArray(saved) ? saved.filter(item => items.some(([id]) => id === item)) : []; } catch { return []; } });
  const dialog = useRef(null); const search = useRef(null);
  useEffect(() => { const listener = event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setPalette(value => !value); } }; window.addEventListener('keydown', listener); return () => window.removeEventListener('keydown', listener); }, []);
  useEffect(() => { if (palette) { dialog.current?.showModal(); search.current?.focus(); } else dialog.current?.close(); }, [palette]);
  useEffect(() => {
    if (!palette || !query.trim() || !guildId) { setResults([]); return undefined; }
    let current = true;
    // Search follows the same debounce as text composition, without persistent polling.
    const timer = setTimeout(() => api(`/api/guilds/${guildId}/platform/search?q=${encodeURIComponent(query)}`).then(result => { if (current) setResults(result.items); }).catch(() => { if (current) setResults([]); }), 300);
    return () => { current = false; clearTimeout(timer); };
  }, [palette, query, guildId]);
  const pin = page => { const next = pins.includes(page) ? pins.filter(id => id !== page) : [...pins, page]; setPins(next); try { localStorage.setItem('sparkles.pinnedPages', JSON.stringify(next)); } catch {} };
  const matches = items.filter(([, label]) => t(label).toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const entry = ([id, key, icon]) => <div className="nav-entry" key={id}><button type="button" aria-current={active === id ? 'page' : undefined} data-section={id} onClick={() => onNavigate(id)}><Icon name={icon} />{t(key)}</button><button type="button" className="nav-pin" aria-label={t(pins.includes(id) ? 'navigation.unpin' : 'navigation.pin')} aria-pressed={pins.includes(id)} onClick={() => pin(id)}>☆</button></div>;
  return <><input className="sidebar-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('navigation.search')} aria-label={t('navigation.search')} /><button type="button" className="sidebar-search" onClick={() => setPalette(true)}>{t('navigation.palette')} <kbd>Ctrl K</kbd></button><nav>
    {!!pins.length && <><p className="nav-group-label">{t('navigation.pinned')}</p>{matches.filter(([id]) => pins.includes(id)).map(entry)}</>}
    {Object.entries(GROUPS).map(([group, pages]) => <div key={group}>{matches.some(([id]) => pages.includes(id)) && <p className="nav-group-label">{t(`navigation.${group}`)}</p>}{matches.filter(([id]) => pages.includes(id)).map(entry)}</div>)}
  </nav><dialog ref={dialog} className="platform-dialog" onCancel={() => setPalette(false)}><div className="platform-dialog-body"><div className="platform-section-heading"><h2>{t('navigation.palette')}</h2><button type="button" className="button secondary" onClick={() => setPalette(false)}>{t('common.close')}</button></div><p>{t('navigation.paletteHelp')}</p><input ref={search} className="palette-search" aria-label={t('platform.search')} value={query} onChange={event => setQuery(event.target.value)} /><div className="palette-results">{matches.map(([id, label]) => <button type="button" key={id} onClick={() => { setPalette(false); onNavigate(id); }}>{t(label)}</button>)}{results.map(result => <button type="button" key={result.id} onClick={() => { setPalette(false); onNavigate(featurePages[result.kind] ?? result.kind, result.id); }}>{result.name}<small>{t(`feature.${result.kind}.title`)}</small></button>)}</div></div></dialog></>;
}
