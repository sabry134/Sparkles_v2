import { useMemo, useState } from 'react';
import { Button, Chip, IconButton, TextField } from '@mui/material';

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
    <div className="emoji-picker mui-emoji-picker">
      <div className="emoji-picker-toolbar">
        <TextField
          id={id}
          size="small"
          value={query}
          placeholder="Search categories"
          onChange={(event) => setQuery(event.target.value)}
        />
        <Chip
          className="emoji-selected"
          label={value || '—'}
          variant="outlined"
          aria-live="polite"
        />
      </div>

      <div className="emoji-groups">
        {visibleGroups.map((group) => (
          <section className="emoji-group" key={group.name}>
            <strong>{group.name}</strong>
            <div className="emoji-grid">
              {group.values.map((emoji) => (
                <IconButton
                  className={
                    value === emoji ? 'emoji-choice selected' : 'emoji-choice'
                  }
                  size="small"
                  key={emoji}
                  onClick={() => onChange(emoji)}
                  aria-label={emoji}
                >
                  <span aria-hidden="true">{emoji}</span>
                </IconButton>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="emoji-custom">
        <TextField
          size="small"
          fullWidth
          value={custom}
          inputProps={{ maxLength: 64 }}
          placeholder="Custom Discord emoji, e.g. <:name:123456789012345678>"
          onChange={(event) => setCustom(event.target.value)}
        />
        <Button
          variant="outlined"
          disabled={!custom.trim()}
          onClick={() => {
            onChange(custom.trim());
            setCustom('');
          }}
        >
          Use custom
        </Button>
      </div>
    </div>
  );
}
