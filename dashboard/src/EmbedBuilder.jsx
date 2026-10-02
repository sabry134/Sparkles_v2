import Icon from './Icon.jsx';

export const EMPTY_EMBED = {
  title: '',
  description: '',
  color: '#8b7cf6',
  url: '',
  authorName: '',
  authorUrl: '',
  authorIconUrl: '',
  thumbnailUrl: '',
  imageUrl: '',
  footerText: '',
  footerIconUrl: '',
  timestamp: false,
  fields: [],
};

function updateField(value, onChange, index, patch) {
  onChange({
    ...value,
    fields: value.fields.map((field, current) =>
      current === index ? { ...field, ...patch } : field,
    ),
  });
}

export default function EmbedBuilder({ value, onChange }) {
  return (
    <div className="embed-builder">
      <div className="embed-editor">
        <div className="embed-editor-grid">
          <label>
            <span>Title</span>
            <input
              maxLength="256"
              value={value.title}
              onChange={(event) => onChange({ ...value, title: event.target.value })}
            />
          </label>
          <label>
            <span>Title URL</span>
            <input
              type="url"
              maxLength="2048"
              value={value.url}
              placeholder="https://"
              onChange={(event) => onChange({ ...value, url: event.target.value })}
            />
          </label>
          <label className="embed-wide-field">
            <span>Description</span>
            <textarea
              maxLength="4096"
              rows="6"
              value={value.description}
              onChange={(event) =>
                onChange({ ...value, description: event.target.value })
              }
            />
          </label>
          <label>
            <span>Color</span>
            <div className="embed-color-control">
              <input
                type="color"
                value={value.color}
                onChange={(event) => onChange({ ...value, color: event.target.value })}
              />
              <input
                maxLength="7"
                value={value.color}
                onChange={(event) => onChange({ ...value, color: event.target.value })}
              />
            </div>
          </label>
          <label>
            <span>Author</span>
            <input
              maxLength="256"
              value={value.authorName}
              onChange={(event) =>
                onChange({ ...value, authorName: event.target.value })
              }
            />
          </label>
          <label>
            <span>Author URL</span>
            <input
              type="url"
              maxLength="2048"
              value={value.authorUrl}
              placeholder="https://"
              onChange={(event) =>
                onChange({ ...value, authorUrl: event.target.value })
              }
            />
          </label>
          <label>
            <span>Author icon URL</span>
            <input
              type="url"
              maxLength="2048"
              value={value.authorIconUrl}
              placeholder="https://"
              onChange={(event) =>
                onChange({ ...value, authorIconUrl: event.target.value })
              }
            />
          </label>
          <label>
            <span>Thumbnail URL</span>
            <input
              type="url"
              maxLength="2048"
              value={value.thumbnailUrl}
              placeholder="https://"
              onChange={(event) =>
                onChange({ ...value, thumbnailUrl: event.target.value })
              }
            />
          </label>
          <label>
            <span>Image URL</span>
            <input
              type="url"
              maxLength="2048"
              value={value.imageUrl}
              placeholder="https://"
              onChange={(event) =>
                onChange({ ...value, imageUrl: event.target.value })
              }
            />
          </label>
          <label>
            <span>Footer</span>
            <input
              maxLength="2048"
              value={value.footerText}
              onChange={(event) =>
                onChange({ ...value, footerText: event.target.value })
              }
            />
          </label>
          <label>
            <span>Footer icon URL</span>
            <input
              type="url"
              maxLength="2048"
              value={value.footerIconUrl}
              placeholder="https://"
              onChange={(event) =>
                onChange({ ...value, footerIconUrl: event.target.value })
              }
            />
          </label>
          <label className="embed-toggle-row">
            <span>Timestamp</span>
            <input
              type="checkbox"
              checked={value.timestamp}
              onChange={(event) =>
                onChange({ ...value, timestamp: event.target.checked })
              }
            />
          </label>
        </div>

        <div className="embed-fields-editor">
          <div className="embed-fields-header">
            <div>
              <strong>Fields</strong>
              <span>Up to 25 fields</span>
            </div>
            <button
              className="button secondary"
              type="button"
              disabled={value.fields.length >= 25}
              onClick={() =>
                onChange({
                  ...value,
                  fields: [
                    ...value.fields,
                    { name: '', value: '', inline: false },
                  ],
                })
              }
            >
              <Icon name="spark" size={15} />
              Add field
            </button>
          </div>
          {value.fields.map((field, index) => (
            <div className="embed-field-row" key={index}>
              <input
                maxLength="256"
                value={field.name}
                placeholder="Field name"
                onChange={(event) =>
                  updateField(value, onChange, index, { name: event.target.value })
                }
              />
              <textarea
                maxLength="1024"
                rows="2"
                value={field.value}
                placeholder="Field value"
                onChange={(event) =>
                  updateField(value, onChange, index, { value: event.target.value })
                }
              />
              <label className="embed-inline-check">
                <input
                  type="checkbox"
                  checked={field.inline}
                  onChange={(event) =>
                    updateField(value, onChange, index, {
                      inline: event.target.checked,
                    })
                  }
                />
                Inline
              </label>
              <div className="embed-field-actions">
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Move field up"
                  disabled={index === 0}
                  onClick={() => {
                    const fields = [...value.fields];
                    [fields[index - 1], fields[index]] = [fields[index], fields[index - 1]];
                    onChange({ ...value, fields });
                  }}
                >
                  ↑
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Move field down"
                  disabled={index === value.fields.length - 1}
                  onClick={() => {
                    const fields = [...value.fields];
                    [fields[index], fields[index + 1]] = [fields[index + 1], fields[index]];
                    onChange({ ...value, fields });
                  }}
                >
                  ↓
                </button>
                <button
                  className="icon-button"
                  type="button"
                  aria-label="Remove field"
                  onClick={() =>
                    onChange({
                      ...value,
                      fields: value.fields.filter((_, current) => current !== index),
                    })
                  }
                >
                  <Icon name="trash" size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="embed-editor-footer">
          <span>
            {[
              value.title,
              value.description,
              value.authorName,
              value.footerText,
              ...value.fields.flatMap((field) => [field.name, field.value]),
            ].reduce((total, item) => total + (item?.length ?? 0), 0).toLocaleString()}
            /6,000 text characters
          </span>
          <button
            className="button secondary"
            type="button"
            onClick={() => onChange(structuredClone(EMPTY_EMBED))}
          >
            Reset embed
          </button>
        </div>
      </div>

      <div className="embed-preview-shell">
        <div className="embed-preview-label">Live preview</div>
        <article
          className="discord-embed-preview"
          style={{ '--embed-color': value.color || '#8b7cf6' }}
        >
          {value.authorName ? (
            <div className="discord-embed-author">
              {value.authorIconUrl ? <img src={value.authorIconUrl} alt="" /> : null}
              {value.authorUrl ? (
                <a href={value.authorUrl} target="_blank" rel="noreferrer">
                  {value.authorName}
                </a>
              ) : (
                <span>{value.authorName}</span>
              )}
            </div>
          ) : null}
          {value.title ? (
            value.url ? (
              <a href={value.url} target="_blank" rel="noreferrer">
                {value.title}
              </a>
            ) : (
              <strong className="discord-embed-title">{value.title}</strong>
            )
          ) : null}
          {value.description ? (
            <div className="discord-embed-description">{value.description}</div>
          ) : null}
          {value.fields.length ? (
            <div className="discord-embed-fields">
              {value.fields.map((field, index) => (
                <div
                  className={
                    field.inline ? 'discord-embed-field inline' : 'discord-embed-field'
                  }
                  key={index}
                >
                  <strong>{field.name || 'Field name'}</strong>
                  <span>{field.value || 'Field value'}</span>
                </div>
              ))}
            </div>
          ) : null}
          {value.thumbnailUrl ? (
            <img className="discord-embed-thumbnail" src={value.thumbnailUrl} alt="" />
          ) : null}
          {value.imageUrl ? (
            <img className="discord-embed-image" src={value.imageUrl} alt="" />
          ) : null}
          {value.footerText || value.timestamp ? (
            <div className="discord-embed-footer">
              {value.footerIconUrl ? <img src={value.footerIconUrl} alt="" /> : null}
              <span>
                {value.footerText}
                {value.footerText && value.timestamp ? ' • ' : ''}
                {value.timestamp ? new Date().toLocaleString() : ''}
              </span>
            </div>
          ) : null}
          {!value.title &&
          !value.description &&
          !value.authorName &&
          !value.footerText &&
          !value.fields.length &&
          !value.imageUrl &&
          !value.thumbnailUrl ? (
            <span className="discord-embed-placeholder">
              Start typing to preview your embed.
            </span>
          ) : null}
        </article>
      </div>
    </div>
  );
}
