const axios = require("axios");
const { ApplicationCommandOptionType, EmbedBuilder } = require("discord.js");
const config = require("../../../config.json");

const formatValue = (value) => {
  if (value === null || value === undefined) return "0";
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return String(value);
  return numeric.toLocaleString();
};

module.exports = {
  name: "donutlookup",
  description: "Get DonutSMP stats for a player",
  options: [
    {
      name: "username",
      description: "Player username",
      type: ApplicationCommandOptionType.String,
      required: true
    }
  ],
  userOnly: true,
  callback: async (client, interaction) => {
    await interaction.deferReply({ ephemeral: true });

    const username = interaction.options.getString("username");
    const apiKey = config.donutsmpApiKey;

    if (!apiKey) {
      return interaction.editReply({
        content: "DonutSMP API key is not configured. Add it to config.json as donutsmpApiKey.",
        ephemeral: true
      });
    }

    try {
      const response = await axios.get(
        `https://api.donutsmp.net/v1/stats/${encodeURIComponent(username)}`,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`
          }
        }
      );

      const stats = response?.data?.result;
      if (!stats) {
        return interaction.editReply({
          content: "No stats found for that user.",
          ephemeral: true
        });
      }

      const fields = [
        { name: "Kills", value: formatValue(stats.kills), inline: true },
        { name: "Deaths", value: formatValue(stats.deaths), inline: true },
        { name: "Mobs Killed", value: formatValue(stats.mobs_killed), inline: true },
        { name: "Broken Blocks", value: formatValue(stats.broken_blocks), inline: true },
        { name: "Placed Blocks", value: formatValue(stats.placed_blocks), inline: true },
        { name: "Playtime", value: formatValue(stats.playtime), inline: true },
        { name: "Money", value: formatValue(stats.money), inline: true },
        { name: "Sell Profit", value: formatValue(stats.money_made_from_sell), inline: true },
        { name: "Shop Spend", value: formatValue(stats.money_spent_on_shop), inline: true },
        { name: "Shards", value: formatValue(stats.shards), inline: true }
      ];

      const embed = new EmbedBuilder()
        .setTitle(`DonutSMP Stats: ${username}`)
        .setColor(0xB8D2F0)
        .addFields(fields);

      return interaction.editReply({ embeds: [embed] });
    } catch (error) {
      const status = error?.response?.status;
      const apiMessage = error?.response?.data?.message;

      if (status === 401) {
        return interaction.editReply({
          content: "Unauthorized. Check your DonutSMP API key.",
          ephemeral: true
        });
      }

      return interaction.editReply({
        content: apiMessage || "Failed to fetch DonutSMP stats.",
        ephemeral: true
      });
    }
  }
};
