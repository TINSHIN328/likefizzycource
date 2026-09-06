const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { bancheck } = require('./bancheck');
const { queryParams } = require('../../../db/database');
const generate = require('../generate');

module.exports = async function bancheckmsg(ssid) {
  if (!ssid || ssid.length < 8) {
    return {
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle('Invalid Input')
          .setDescription('Please provide a valid SSID.')
      ],
      components: []
    };
  }

  const result = await bancheck(ssid);

  const embed = new EmbedBuilder()
    .setTitle(result.username || 'Unknown Account');

  let components = [];

  if (result.banReason === 'invalid_token') {
    embed.setColor(0xff0000)
         .setTitle('Invalid SSID')
         .setDescription('The SSID is invalid or expired.');
    return {
      embeds: [embed],
      components
    };
  }

  if (typeof result.ban === 'string' && result.ban.startsWith("Couldn't check ban:")) {
    embed.setColor(0xFFA500)
         .setDescription(`Couldn't check ban: \`${result.banReason || "Unknown"}\``);
    return {
      embeds: [embed],
      components
    };
  }

  if (result.ban === true) {
    embed.setColor(0xff0000);

    let description = `Banned: \`${result.banReason || "Unknown"}\``;
    if (result.banId) {
      description += `\nBan ID: \`${result.banId.toUpperCase()}\``;
    }
    embed.setDescription(description);

    const fields = [];

    if (result.banReason) {
      fields.push({
        name: 'Reason',
        value: `\`${result.banReason}\``,
        inline: true
      });
    }

    if (result.unbanTime) {
      fields.push({
        name: 'Unban',
        value: result.unbanTime === 'never'
          ? '`Never`'
          : `<t:${Math.floor(result.unbanTime)}:R>`,
        inline: true
      });

      if (result.unbanTime === 'never') {
        const id = generate(32);
        await queryParams(
          `INSERT INTO actions (id,action) VALUES (?,?)`,
          [id, `appeal|${ssid}`]
        );

        const appealButton = new ButtonBuilder()
          .setCustomId(`appeal|${id}`)
          .setLabel('Appeal Ban')
          .setStyle(ButtonStyle.Danger);

        components = [new ActionRowBuilder().addComponents(appealButton)];
      }
    }

    if (fields.length > 0) {
      embed.addFields(fields);
    }
  } else if (result.ban === false) {
    embed.setColor(0x00ff00)
         .setDescription('Unbanned');
  } else {
    embed.setColor(0x808080)
         .setDescription('Ban status unknown.');
  }

  return {
    embeds: [embed],
    components
  };
};
