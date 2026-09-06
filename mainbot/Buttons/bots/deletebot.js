const { queryParams } = require("../../../db/database");
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");

module.exports = {
    name: "deletebot",
    editbot: true,
    callback: async (client, interaction) => {
        if (client.isuserbot) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("Please use the main Autosecure bot to delete this bot!")
                        .setColor("#87CEEB")
                ],
                ephemeral: true
            });
            return;
        }

        const split = interaction.customId.split('|');
        if (split.length < 3) {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle("Error, please report as deletebot-1")
                        .setColor("#FF0000")
                ],
                ephemeral: true
            });
            return;
        }

        const id = split[1];
        const botnumber = split[2];

        const embed = new EmbedBuilder()
            .setTitle("Confirm Deleting Bot")
            .setDescription("Are you sure you want to delete this bot?")
            .setColor(0xFF0000);

        const deleteButton = new ButtonBuilder()
            .setLabel("Delete")
            .setStyle(ButtonStyle.Danger)
            .setCustomId(`deletebotconfirm|${id}|${botnumber}`);

        const row = new ActionRowBuilder().addComponents(deleteButton);

        await interaction.reply({
            embeds: [embed],
            components: [row],
            ephemeral: true
        });
    }
};
