import MessageStudio from './MessageStudio.jsx';
import { EMPTY_MESSAGE } from '../../shared/discord-limits.js';

export const EMPTY_EMBED = {
  title: '', description: '', color: '', url: '', authorName: '', authorUrl: '',
  authorIconUrl: '', thumbnailUrl: '', imageUrl: '', footerText: '', footerIconUrl: '', timestamp: false, fields: [],
};

export default function EmbedBuilder({ value, onChange, resources = {}, limits }) {
  const embed = {
    ...(value.title ? { title: value.title } : {}), ...(value.description ? { description: value.description } : {}),
    ...(value.color && /^#[a-f0-9]{6}$/iu.test(value.color) ? { color: Number.parseInt(value.color.slice(1), 16) } : {}),
    ...(value.url ? { url: value.url } : {}),
    ...(value.authorName ? { author: { name: value.authorName, ...(value.authorUrl ? { url: value.authorUrl } : {}), ...(value.authorIconUrl ? { icon_url: value.authorIconUrl } : {}) } } : {}),
    ...(value.footerText ? { footer: { text: value.footerText, ...(value.footerIconUrl ? { icon_url: value.footerIconUrl } : {}) } } : {}),
    ...(value.thumbnailUrl ? { thumbnail: { url: value.thumbnailUrl } } : {}), ...(value.imageUrl ? { image: { url: value.imageUrl } } : {}),
    ...(value.timestamp ? { timestamp: new Date().toISOString() } : {}), fields: value.fields ?? [],
  };
  return <MessageStudio embedOnly resources={resources} limits={limits} value={{ ...structuredClone(EMPTY_MESSAGE), embeds: [embed] }} onChange={message => {
    const next = message.embeds[0] ?? {};
    onChange({ ...EMPTY_EMBED, title: next.title ?? '', description: next.description ?? '',
      color: next.color === undefined ? '' : '#' + next.color.toString(16).padStart(6, '0'), url: next.url ?? '',
      authorName: next.author?.name ?? '', authorUrl: next.author?.url ?? '', authorIconUrl: next.author?.icon_url ?? '',
      footerText: next.footer?.text ?? '', footerIconUrl: next.footer?.icon_url ?? '',
      thumbnailUrl: next.thumbnail?.url ?? '', imageUrl: next.image?.url ?? '', timestamp: !!next.timestamp, fields: next.fields ?? [],
    });
  }} />;
}
