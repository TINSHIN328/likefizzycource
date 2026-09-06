const { EmbedBuilder } = require('discord.js');
module.exports = {
  name: 'starting_bot',
  callback: async (client, interaction) => {
    await interaction.reply({ content: `Heres a full guide to gain access, setup & manage your bot, and start phishing! \nhttps://youtu.be/PotitTNit_Y`, ephemeral: true });
  }
};
