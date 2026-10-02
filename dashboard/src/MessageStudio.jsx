import { useEffect, useRef, useState } from 'react';
import {
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  MenuItem,
  Select as MuiSelect,
  Tab,
  Tabs,
  TextField,
} from '@mui/material';
import { t } from './i18n/index.js';
import { DISCORD_LIMITS as L, EMPTY_MESSAGE, MESSAGE_VARIABLES, embedTextLength, messageIssues, safeUrl } from '../../shared/discord-limits.js';

export function downloadJson(value, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `${name}.json`; link.click(); URL.revokeObjectURL(url);
}

export function Markdown({ value = '', resources = {} }) {
  const tokens = String(value).split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|<[@#][!&]?\d+>|https?:\/\/[^\s<>]+)/gu);
  return <span className="studio-markdown">{tokens.map((token, index) => {
    if (token.startsWith('**') && token.endsWith('**')) return <strong key={index}>{token.slice(2, -2)}</strong>;
    if (token.startsWith('`') && token.endsWith('`')) return <code key={index}>{token.slice(1, -1)}</code>;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/u.exec(token);
    if (link && safeUrl(link[2])) return <a key={index} href={link[2]} target="_blank" rel="noreferrer noopener">{link[1]}</a>;
    if (/^https?:\/\//u.test(token) && safeUrl(token)) return <a key={index} href={token} target="_blank" rel="noreferrer noopener">{token}</a>;
    const mention = /^<([@#])[!&]?(\d+)>$/u.exec(token);
    if (mention) return <span className="studio-mention" key={index}>{mention[1]}{[...(resources.roles ?? []), ...(resources.channels ?? [])].find(item => item.id === mention[2])?.name ?? mention[2]}</span>;
    return <span key={index}>{token}</span>;
  })}</span>;
}

export function MessagePreview({ value, resources = {}, mobile = false }) {
  const safeImage = (url, className) => safeUrl(url) ? <img loading="lazy" referrerPolicy="no-referrer" className={className} src={url} alt="" /> : null;
  const safeLink = (url, children) => safeUrl(url) ? <a href={url} target="_blank" rel="noreferrer noopener">{children}</a> : children;
  return <div className={`studio-preview ${mobile ? 'mobile' : ''}`}>
    <div className="studio-preview-author"><span className="studio-avatar">{t('brand.mark')}</span><strong>{t('brand.name')}</strong><span className="studio-bot-label">{t('studio.app')}</span></div>
    <div className="studio-preview-body">
      {value.content && <div className="studio-preview-content"><Markdown value={value.content} resources={resources} /></div>}
      {(value.embeds ?? []).map((embed, index) => <article key={index} className="studio-preview-embed" style={Number.isInteger(embed.color) ? { borderLeftColor: `#${embed.color.toString(16).padStart(6, '0')}` } : undefined}>
        {safeImage(embed.thumbnail?.url, 'studio-thumbnail')}
        {embed.author?.name && <div className="studio-author">{safeImage(embed.author.icon_url, 'studio-small-image')}{safeLink(embed.author.url, embed.author.name)}</div>}
        {embed.title && <strong className="studio-title">{safeLink(embed.url, <Markdown value={embed.title} />)}</strong>}
        {embed.description && <div className="studio-description"><Markdown value={embed.description} resources={resources} /></div>}
        {!!embed.fields?.length && <div className="studio-preview-fields">{embed.fields.map((field, position) => <div className={field.inline ? 'inline' : ''} key={position}><strong><Markdown value={field.name} resources={resources} /></strong><Markdown value={field.value} resources={resources} /></div>)}</div>}
        {safeImage(embed.image?.url, 'studio-large-image')}
        {(embed.footer?.text || embed.timestamp) && <div className="studio-footer">{safeImage(embed.footer?.icon_url, 'studio-small-image')}<span>{embed.footer?.text}{embed.footer?.text && embed.timestamp ? t('studio.separator') : ''}{embed.timestamp && Number.isFinite(Date.parse(embed.timestamp)) ? new Date(embed.timestamp).toLocaleString() : ''}</span></div>}
      </article>)}
      {(value.components ?? []).map((row, index) => <div className="studio-preview-components" key={index}>{row.components?.map((component, position) => component.type === 2 ? (
          <span
            key={position}
            className={`studio-component style-${component.style}`}
          >
            {component.emoji?.name} {component.label}
          </span>
        ) : (
          <FormControl size="small" key={position}>
            <MuiSelect
              aria-label={t('studio.componentPreview')}
              disabled
              value=""
              displayEmpty
            >
              <MenuItem value="">
                {component.options?.[0]?.label ?? t('studio.componentPreview')}
              </MenuItem>
            </MuiSelect>
          </FormControl>
        ))}</div>)}
      {!value.content && !value.embeds?.length && <p className="muted">{t('studio.emptyPreview')}</p>}
    </div>
  </div>;
}

function TextControl({
  label,
  value = '',
  onChange,
  maximum,
  multiline = false,
  type = 'text',
}) {
  return (
    <label className="studio-control mui-studio-control">
      <span>{t(`studio.${label}`)}</span>
      <TextField
        fullWidth
        type={multiline ? 'text' : type}
        multiline={multiline}
        minRows={multiline ? 4 : undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {maximum ? (
        <small className={value.length > maximum ? 'error-text' : 'muted'}>
          {t('studio.characterCount', { count: value.length, limit: maximum })}
        </small>
      ) : null}
    </label>
  );
}
export default function MessageStudio({ value = EMPTY_MESSAGE, onChange, resources = {}, limits, embedOnly = false }) {
  const [tab, setTab] = useState('compose');
  const [mobile, setMobile] = useState(false);
  const [selected, setSelected] = useState(0);
  const [json, setJson] = useState('');
  const [notice, setNotice] = useState('');
  const history = useRef({ past: [], future: [] });
  const last = useRef(value);
  const dragIndex = useRef(null);
  const fileInput = useRef(null);
  const contentRef = useRef(null);
  useEffect(() => { last.current = value; }, [value]);
  const update = next => {
    history.current.past.push(structuredClone(last.current));
    if (history.current.past.length > (limits?.maximumHistory ?? L.fieldValue)) history.current.past.shift();
    history.current.future = []; last.current = next; onChange(next);
  };
  const undo = () => { if (!history.current.past.length) return; history.current.future.push(structuredClone(value)); onChange(history.current.past.pop()); };
  const redo = () => { if (!history.current.future.length) return; history.current.past.push(structuredClone(value)); onChange(history.current.future.pop()); };
  const current = Math.min(selected, Math.max(0, value.embeds.length - 1));
  const embed = value.embeds[current];
  const changeEmbed = patch => update({ ...value, embeds: value.embeds.map((item, index) => index === current ? { ...item, ...patch } : item) });
  const nested = (key, field, entry) => {
    const part = { ...(embed[key] ?? {}), [field]: entry };
    const next = { ...embed, [key]: Object.fromEntries(Object.entries(part).filter(([, value]) => value !== '')) };
    if (!Object.keys(next[key]).length) delete next[key];
    update({ ...value, embeds: value.embeds.map((item, index) => index === current ? next : item) });
  };
  const fields = embed?.fields ?? [];
  const reorder = (from, to) => { if (from === to || from < 0 || to < 0 || to >= fields.length) return; const next = [...fields]; next.splice(to, 0, next.splice(from, 1)[0]); changeEmbed({ fields: next }); };
  const issues = messageIssues(value, { allowEmpty: true });
  const insert = token => {
    const textarea = contentRef.current;
    const start = textarea?.selectionStart ?? value.content.length; const end = textarea?.selectionEnd ?? start;
    update({ ...value, content: `${value.content.slice(0, start)}${token}${value.content.slice(end)}` });
    textarea?.focus();
  };
  const imported = text => {
    try { const parsed = JSON.parse(text); const found = messageIssues(parsed, { allowEmpty: true }); if (found.length) throw new Error(); update(parsed); setNotice(t('studio.imported')); }
    catch { setNotice(t('studio.invalidJson')); }
  };
  return <div className="message-studio">
    <div className="studio-toolbar">
      <Tabs
        className="platform-tabs mui-studio-tabs"
        value={tab}
        onChange={(_, mode) => {
          setTab(mode);
          if (mode === 'json') setJson(JSON.stringify(value, null, 2));
        }}
        aria-label={t('studio.editorMode')}
      >
        {['compose', 'json'].map((mode) => (
          <Tab key={mode} value={mode} label={t(`studio.${mode}`)} />
        ))}
      </Tabs>
      <div className="platform-actions">
        <Button type="button" className="button secondary" disabled={!history.current.past.length} onClick={undo}>{t('studio.undo')}</Button>
        <Button type="button" className="button secondary" disabled={!history.current.future.length} onClick={redo}>{t('studio.redo')}</Button>
        <Button type="button" className="button secondary" onClick={() => navigator.clipboard.writeText(JSON.stringify(value, null, 2)).then(() => setNotice(t('studio.copied'))).catch(() => setNotice(t('studio.copyFailed')))}>{t('studio.copyJson')}</Button>
        <Button type="button" className="button secondary" onClick={() => downloadJson(value, t('studio.exportFilename'))}>{t('studio.export')}</Button>
        <Button type="button" className="button secondary" onClick={() => fileInput.current?.click()}>{t('studio.import')}</Button>
        <input hidden type="file" accept="application/json,.json" ref={fileInput} onChange={async event => {
          const file = event.target.files?.[0]; if (!file) return;
          if (limits && file.size > limits.maximumImportBytes) { setNotice(t('studio.fileTooLarge')); return; }
          imported(await file.text()); event.target.value = '';
        }} />
      </div>
    </div>
    {notice && <p className="platform-notice" role="status">{notice}</p>}
    <div className="studio-layout">
      <div className="studio-editor">
        {tab === 'json' ? (
          <>
            <label className="studio-control mui-studio-control">
              <span>{t('studio.json')}</span>
              <TextField
                className="studio-json"
                fullWidth
                multiline
                minRows={20}
                value={json}
                onChange={(event) => setJson(event.target.value)}
                inputProps={{ spellCheck: false }}
              />
            </label>
            <Button variant="outlined" onClick={() => imported(json)}>
              {t('studio.applyJson')}
            </Button>
          </>
        ) : (<>
          {!embedOnly && <>
            <label className="studio-control mui-studio-control">
              <span>{t('studio.content')}</span>
              <TextField
                inputRef={contentRef}
                fullWidth
                multiline
                minRows={5}
                value={value.content}
                onChange={(event) =>
                  update({ ...value, content: event.target.value })
                }
              />
              <small
                className={value.content.length > L.content ? 'error-text' : 'muted'}
              >
                {t('studio.characterCount', {
                  count: value.content.length,
                  limit: L.content,
                })}
              </small>
            </label>
            <div className="platform-actions">
              <FormControl size="small" sx={{ minWidth: 170 }}>
                <MuiSelect
                  displayEmpty
                  aria-label={t('studio.variables')}
                  value=""
                  onChange={(event) =>
                    event.target.value && insert(`{${event.target.value}}`)
                  }
                >
                  <MenuItem value="">{t('studio.variables')}</MenuItem>
                  {MESSAGE_VARIABLES.map((variable) => (
                    <MenuItem value={variable} key={variable}>
                      {`{${variable}}`}
                    </MenuItem>
                  ))}
                </MuiSelect>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 190 }}>
                <MuiSelect
                  displayEmpty
                  aria-label={t('studio.channelMention')}
                  value=""
                  onChange={(event) =>
                    event.target.value && insert(`<#${event.target.value}>`)
                  }
                >
                  <MenuItem value="">{t('studio.channelMention')}</MenuItem>
                  {resources.channels?.map((channel) => (
                    <MenuItem key={channel.id} value={channel.id}>
                      {channel.name}
                    </MenuItem>
                  ))}
                </MuiSelect>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 190 }}>
                <MuiSelect
                  displayEmpty
                  aria-label={t('studio.roleMention')}
                  value=""
                  onChange={(event) =>
                    event.target.value && insert(`<@&${event.target.value}>`)
                  }
                >
                  <MenuItem value="">{t('studio.roleMention')}</MenuItem>
                  {resources.roles?.map((role) => (
                    <MenuItem key={role.id} value={role.id}>
                      {role.name}
                    </MenuItem>
                  ))}
                </MuiSelect>
              </FormControl>
            </div>
          </>}
          <div className="studio-section-heading"><h3>{t('studio.embeds')}</h3><Button type="button" className="button secondary" disabled={value.embeds.length >= (embedOnly ? 1 : L.embeds)} onClick={() => { update({ ...value, embeds: [...value.embeds, {}] }); setSelected(value.embeds.length); }}>{t('studio.addEmbed')}</Button></div>
          {!!value.embeds.length && <div className="platform-tabs">{value.embeds.map((_, index) => <Button type="button" key={index} aria-pressed={current === index} onClick={() => setSelected(index)}>{t('studio.embedNumber', { number: index + 1 })}</Button>)}</div>}
          {embed && <div className="studio-embed-editor">
            <TextControl label="title" value={embed.title} maximum={L.title} onChange={title => changeEmbed({ title })} />
            <TextControl label="description" value={embed.description} maximum={L.description} multiline onChange={description => changeEmbed({ description })} />
            <details className="studio-details"><summary>{t('studio.appearance')}</summary><div className="platform-form-grid">
              <TextControl label="titleUrl" value={embed.url} type="url" onChange={url => changeEmbed({ url })} />
              <TextControl label="color" value={embed.color === undefined ? '' : `#${embed.color.toString(16).padStart(6, '0')}`} onChange={color => {
                if (/^#[a-f0-9]{6}$/iu.test(color)) changeEmbed({ color: Number.parseInt(color.slice(1), 16) });
                else if (!color) { const next = { ...embed }; delete next.color; update({ ...value, embeds: value.embeds.map((item, index) => index === current ? next : item) }); }
              }} />
              <TextControl label="author" value={embed.author?.name} maximum={L.author} onChange={name => nested('author', 'name', name)} />
              <TextControl label="authorUrl" value={embed.author?.url} type="url" onChange={url => nested('author', 'url', url)} />
              <TextControl label="authorIcon" value={embed.author?.icon_url} type="url" onChange={url => nested('author', 'icon_url', url)} />
              <TextControl label="thumbnail" value={embed.thumbnail?.url} type="url" onChange={url => nested('thumbnail', 'url', url)} />
              <TextControl label="image" value={embed.image?.url} type="url" onChange={url => nested('image', 'url', url)} />
              <TextControl label="footer" value={embed.footer?.text} maximum={L.footer} onChange={text => nested('footer', 'text', text)} />
              <TextControl label="footerIcon" value={embed.footer?.icon_url} type="url" onChange={url => nested('footer', 'icon_url', url)} />
              <TextControl label="timestamp" value={embed.timestamp ? new Date(embed.timestamp).toISOString().slice(0, 16) : ''} type="datetime-local" onChange={value => { const next = { ...embed }; if (value) next.timestamp = new Date(`${value}Z`).toISOString(); else delete next.timestamp; update({ ...last.current, embeds: last.current.embeds.map((item, index) => index === current ? next : item) }); }} />
            </div></details>
            <div className="studio-section-heading"><h4>{t('studio.fields')}</h4><Button type="button" className="button secondary" disabled={fields.length >= L.fields} onClick={() => changeEmbed({ fields: [...fields, { name: '', value: '', inline: false }] })}>{t('studio.addField')}</Button></div>
            {fields.map((field, index) => <div className="studio-field" key={index} draggable onDragStart={() => { dragIndex.current = index; }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); reorder(dragIndex.current, index); }}>
              <div className="studio-field-top"><strong>{t('studio.fieldNumber', { number: index + 1 })}</strong><div className="platform-actions"><Button type="button" aria-label={t('studio.moveUp')} disabled={!index} onClick={() => reorder(index, index - 1)}>↑</Button><Button type="button" aria-label={t('studio.moveDown')} disabled={index === fields.length - 1} onClick={() => reorder(index, index + 1)}>↓</Button><Button type="button" onClick={() => changeEmbed({ fields: fields.filter((_, position) => position !== index) })}>{t('studio.remove')}</Button></div></div>
              <TextControl label="fieldName" value={field.name} maximum={L.fieldName} onChange={name => changeEmbed({ fields: fields.map((item, position) => position === index ? { ...item, name } : item) })} />
              <TextControl label="fieldValue" value={field.value} maximum={L.fieldValue} multiline onChange={value => changeEmbed({ fields: fields.map((item, position) => position === index ? { ...item, value } : item) })} />
              <FormControlLabel
                className="platform-check mui-platform-check"
                control={
                  <Checkbox
                    checked={field.inline === true}
                    onChange={(event) =>
                      changeEmbed({
                        fields: fields.map((item, position) =>
                          position === index
                            ? { ...item, inline: event.target.checked }
                            : item,
                        ),
                      })
                    }
                  />
                }
                label={t('studio.inline')}
              />
            </div>)}
            <div className="platform-actions"><Button type="button" className="button secondary" disabled={embedOnly || value.embeds.length >= L.embeds} onClick={() => { update({ ...value, embeds: [...value.embeds, structuredClone(embed)] }); setSelected(value.embeds.length); }}>{t('studio.duplicateEmbed')}</Button><Button type="button" className="button secondary" onClick={() => update({ ...value, embeds: value.embeds.filter((_, index) => index !== current) })}>{t('studio.removeEmbed')}</Button></div>
          </div>}
          {!embedOnly && <details className="studio-details"><summary>{t('studio.componentsMentions')}</summary>
            <p className="muted">{t('studio.interactiveHelp')}</p>
            {(value.components ?? []).flatMap((row, rowIndex) => row.components.map((button, buttonIndex) => <div className="studio-field" key={`${rowIndex}:${buttonIndex}`}><TextControl label="buttonLabel" value={button.label} maximum={L.buttonLabel} onChange={label => update({ ...value, components: value.components.map((item, index) => index === rowIndex ? { ...item, components: item.components.map((component, current) => current === buttonIndex ? { ...component, label } : component) } : item) })} /><TextControl label="buttonUrl" value={button.url} type="url" onChange={url => update({ ...value, components: value.components.map((item, index) => index === rowIndex ? { ...item, components: item.components.map((component, current) => current === buttonIndex ? { ...component, url } : component) } : item) })} /><Button className="button secondary" type="button" onClick={() => update({ ...value, components: value.components.map((item, index) => index === rowIndex ? { ...item, components: item.components.filter((_, current) => current !== buttonIndex) } : item).filter(item => item.components.length) })}>{t('studio.remove')}</Button></div>))}
            <Button type="button" className="button secondary" disabled={value.components.length >= L.rows} onClick={() => update({ ...value, components: [...value.components, { type: 1, components: [{ type: 2, style: 5, label: '', url: '' }] }] })}>{t('studio.addLink')}</Button>
            <p className="muted">{t('studio.mentionsHelp')}</p>
            <FormControlLabel
              className="platform-check mui-platform-check"
              control={
                <Checkbox
                  checked={
                    value.allowed_mentions?.parse?.includes('everyone') ?? false
                  }
                  onChange={(event) =>
                    update({
                      ...value,
                      allowed_mentions: {
                        ...value.allowed_mentions,
                        parse: event.target.checked ? ['everyone'] : [],
                      },
                    })
                  }
                />
              }
              label={t('studio.everyone')}
            />
            <label className="studio-control mui-studio-control">
              <span>{t('studio.allowedRoles')}</span>
              <FormControl size="small" fullWidth>
                <MuiSelect
                  multiple
                  value={value.allowed_mentions?.roles ?? []}
                  onChange={(event) =>
                    update({
                      ...value,
                      allowed_mentions: {
                        ...value.allowed_mentions,
                        roles:
                          typeof event.target.value === 'string'
                            ? event.target.value.split(',')
                            : event.target.value,
                      },
                    })
                  }
                  renderValue={(selected) =>
                    selected
                      .map(
                        (id) =>
                          resources.roles?.find((role) => role.id === id)?.name ??
                          id,
                      )
                      .join(', ')
                  }
                >
                  {resources.roles?.map((role) => (
                    <MenuItem key={role.id} value={role.id}>
                      <Checkbox
                        size="small"
                        checked={(value.allowed_mentions?.roles ?? []).includes(
                          role.id,
                        )}
                        sx={{ mr: 1 }}
                      />
                      {role.name}
                    </MenuItem>
                  ))}
                </MuiSelect>
              </FormControl>
            </label>
            <TextControl label="allowedUsers" value={value.allowed_mentions?.users?.join(', ') ?? ''} onChange={users => update({ ...value, allowed_mentions: { ...value.allowed_mentions, users: users.split(/[\s,]+/u).filter(Boolean) } })} />
          </details>}
          <Button type="button" className="button secondary" onClick={() => update(structuredClone(EMPTY_MESSAGE))}>{t('studio.reset')}</Button>
        </>}
      </div>
      <aside className="studio-preview-column"><div className="studio-section-heading"><strong>{t('studio.livePreview')}</strong><Button type="button" className="button secondary" aria-pressed={mobile} onClick={() => setMobile(!mobile)}>{t(mobile ? 'studio.mobile' : 'studio.desktop')}</Button></div><MessagePreview value={value} resources={resources} mobile={mobile} /><p className="muted">{t('studio.previewHelp')}</p><p className={value.embeds.reduce((sum, embed) => sum + embedTextLength(embed), 0) > L.embedText ? 'error-text' : 'muted'}>{t('studio.embedCharacters', { count: value.embeds.reduce((sum, embed) => sum + embedTextLength(embed), 0), limit: L.embedText })}</p>
        {!!issues.length && <ul className="studio-issues" role="status">{issues.map((issue, index) => <li key={index}>{t(`studio.issue.${issue.code}`, { path: issue.path, limit: issue.limit })}</li>)}</ul>}
      </aside>
    </div>
  </div>;
}
