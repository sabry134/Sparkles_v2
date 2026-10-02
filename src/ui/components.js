import {
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';

const DEFAULT_ACCENT_COLOR = 0x5865f2;

export function componentMessage({
  title,
  description,
  fields = [],
  footer,
  accentColor = DEFAULT_ACCENT_COLOR,
  ephemeral = false,
  actionRows = [],
  mediaUrls = [],
}) {
  const container = new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# ${title}\n${description}`),
    );

  if (mediaUrls.length > 0) {
    const gallery = new MediaGalleryBuilder().addItems(
      ...mediaUrls.slice(0, 10).map((url) => new MediaGalleryItemBuilder().setURL(url)),
    );
    container.addMediaGalleryComponents(gallery);
  }

  if (fields.length > 0) {
    container.addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
    );

    const fieldText = fields
      .map(({ name, value }) => `**${name}**\n${value}`)
      .join('\n\n');
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(fieldText));
  }

  if (footer) {
    container
      .addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      )
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${footer}`));
  }

  for (const row of actionRows) {
    container.addActionRowComponents(row);
  }

  const flags = ephemeral
    ? MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
    : MessageFlags.IsComponentsV2;

  return {
    components: [container],
    flags,
    allowedMentions: { parse: [] },
  };
}

export function successMessage(title, description, options = {}) {
  return componentMessage({
    title,
    description,
    accentColor: 0x57f287,
    ...options,
  });
}

export function errorMessage(title, description, options = {}) {
  return componentMessage({
    title,
    description,
    accentColor: 0xed4245,
    ephemeral: true,
    ...options,
  });
}
