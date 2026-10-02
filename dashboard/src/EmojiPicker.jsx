import { useMemo, useState } from 'react';

const EMOJI_GROUPS = [
  {
    name: 'Popular',
    values: ['👍','👎','❤️','🔥','🎉','✅','❌','⭐','💯','🚀','👀','🙏','👏','💡','📌','🎯'],
  },
  {
    name: 'Roles',
    values: ['🎨','🎮','🎧','🎬','📚','💻','🛠️','⚽','🏀','🏎️','✈️','🌍','🔔','📢','📰','🎁'],
  },
  {
    name: 'Status',
    values: ['🟢','🟡','🔴','🔵','🟣','⚪','⚫','🟠','💚','💛','❤️','💙','💜','🤍','🖤','🩷'],
  },
  {
    name: 'Community',
    values: ['😀','😄','😂','🥳','😍','🤩','😎','🤝','🫡','🙌','💬','❓','❗','✨','🌟','🏆'],
  },
  {
    name: 'Utility',
    values: ['🔒','🔓','🛡️','⚙️','🧰','📁','📅','⏰','🧪','🧭','📊','📈','📝','🔗','📨','🗳️'],
  },
];

export default function EmojiPicker({ value, onChange, id }) {
  const [query, setQuery] = useState('');
  const [custom, setCustom] = useState('');

  const visibleGroups = useMemo(() => {
    if (!query.trim()) return EMOJI_GROUPS;
    const normalized = query.trim().toLocaleLowerCase('en-US');
    return EMOJI_GROUPS.filter((group) =>
      group.name.toLocaleLowerCase('en-US').includes(normalized),
    );
  }, [query]);

  return (
    <div className="emoji-picker">
      <div className="emoji-picker-toolbar">
        <input
          id={id}
          value={query}
          placeholder="Search categories"
          onChange={(event) => setQuery(event.target.value)}
        />
        <span className="emoji-selected" aria-live="polite">
          {value || '—'}
        </span>
      </div>
      <div className="emoji-groups">
        {visibleGroups.map((group) => (
          <section className="emoji-group" key={group.name}>
            <strong>{group.name}</strong>
            <div className="emoji-grid">
              {group.values.map((emoji) => (
                <button
                  className={value === emoji ? 'emoji-choice selected' : 'emoji-choice'}
                  type="button"
                  key={emoji}
                  onClick={() => onChange(emoji)}
                  aria-label={emoji}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
      <div className="emoji-custom">
        <input
          value={custom}
          maxLength="64"
          placeholder="Custom Discord emoji, e.g. <:name:123456789012345678>"
          onChange={(event) => setCustom(event.target.value)}
        />
        <button
          className="button secondary"
          type="button"
          disabled={!custom.trim()}
          onClick={() => {
            onChange(custom.trim());
            setCustom('');
          }}
        >
          Use custom
        </button>
      </div>
    </div>
  );
}
