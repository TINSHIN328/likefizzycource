const getUUID = require("../../utils/hypixelapi/getUUID");
const getStats = require('../../utils/hypixelapi/getStats');
const short = require("short-number");
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: "bedwars2",
    usestatsbutton: true,
    callback: async (client, interaction) => {
        try {
            await interaction.deferReply({ ephemeral: true });

            let mcname = interaction.customId.split("|")[1];
            if (!mcname) {
                const noneEmbed = new EmbedBuilder()
                    .setTitle('Bedwars stats')
                    .setDescription('None')
                    .setColor("#D4B7D9");
                return interaction.editReply({ content: null, embeds: [noneEmbed] });
            }

            let stats = await getStats(mcname);
            if (!stats || !stats.bedwars) {
                const noneEmbed = new EmbedBuilder()
                    .setTitle('Bedwars stats')
                    .setDescription('None')
                    .setColor("#D4B7D9");
                return interaction.editReply({ content: null, embeds: [noneEmbed] });
            }
            let bedwars = stats.bedwars;

            let color = null;
            if (stats.color !== undefined && stats.color !== null && stats.color) {
                color = stats.color;
            }

            const output = `NWL: \`${stats.nwl || "N/A"}\` \n` +
                `\`[${bedwars.level || 0}✫]\` \`[${stats.rank || "None"}]\`` +
                (color ? ` \`${color}\`` : "") + `\n` +
                `\`•\`WLR: \`${bedwars.wlr || 0}\` (Wins: \`${bedwars.wins || 0}\`, Losses: \`${bedwars.losses || 0}\`)\n` +
                `\`•\`FKDR: \`${bedwars.fkdr || 0}\` (Final Kills: \`${bedwars.finalKills || 0}\`, Final Deaths: \`${bedwars.finalDeaths || 0}\`)\n` +
                `\`•\`BBLR: \`${bedwars.bblr || 0}\` (Beds Broken: \`${bedwars.bedsBroken || 0}\`, Beds Lost: \`${bedwars.bedsLost || 0}\`)`;

            const embed = new EmbedBuilder()
                .setTitle('Bedwars stats')
                .setDescription(output)
                .setColor("#D4B7D9");

            await interaction.editReply({ content: null, embeds: [embed] });

        } catch (error) {
            console.error("Error in bedwars2 command:", error);
            const noneEmbed = new EmbedBuilder()
                .setTitle('Bedwars stats')
                .setDescription('None')
                .setColor("#D4B7D9");
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: null, embeds: [noneEmbed] });
            } else {
                await interaction.reply({ content: 'None', ephemeral: true });
            }
        }
    }
};
