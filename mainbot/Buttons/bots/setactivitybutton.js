const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

module.exports = {
    name: "setactivity",
    editbot: true,
    callback: async (client, interaction) => {
        let id = interaction.customId.split('|')[1];
        let botnumber = interaction.customId.split('|')[2];

        const modal = new ModalBuilder()
            .setCustomId(`activity_modal|${id}|${botnumber}`)
            .setTitle('Set Bot Activity');

        const activityTypeInput = new TextInputBuilder()
            .setCustomId('activity_type')
            .setLabel('Activity Type')
            .setPlaceholder('Playing, Watching, Listening, Competing, Streaming')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(10)
            .setRequired(false);

        const activityTextInput = new TextInputBuilder()
            .setCustomId('activity_text')
            .setLabel('Activity Text')
            .setPlaceholder('Enter the text for your activity status')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(128)
            .setRequired(false);

            
        const activity_visibility = new TextInputBuilder()
            .setCustomId('activity_visibility')
            .setLabel('Visibility')
            .setPlaceholder('online, dnd, invisible, idle')
            .setStyle(TextInputStyle.Short)
            .setMaxLength(128)
            .setRequired(true);

        const firstActionRow = new ActionRowBuilder().addComponents(activityTypeInput);
        const secondActionRow = new ActionRowBuilder().addComponents(activityTextInput);
        const thirdActionRow = new ActionRowBuilder().addComponents(activity_visibility)

        modal.addComponents(thirdActionRow, firstActionRow, secondActionRow);

        await interaction.showModal(modal);
    }
};
