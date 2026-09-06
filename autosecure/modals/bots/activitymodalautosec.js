const { editbotmsg } = require("../../../autosecure/utils/responses/editbotmessage");
const { queryParams } = require("../../../db/database");
const { autosecureMap } = require("../../../mainbot/handlers/botHandler");

module.exports = {
    name: "activity_modal",
    editbot: true,
    callback: async (client, interaction) => {
        try {
            await interaction.deferUpdate();

            let activityType = interaction.fields.getTextInputValue('activity_type');
            let activityText = interaction.fields.getTextInputValue('activity_text');
            const activityvisibility = interaction.fields.getTextInputValue("activity_visibility");

            if (!activityType || activityType.trim() === '') activityType = null;
            if (!activityText || activityText.trim() === '') activityText = null;

            if (activityType !== null) {
                const validActivities = ['playing', 'streaming', 'listening', 'watching', 'competing'];
                const lowerType = activityType.toLowerCase();

                if (!validActivities.some(activity => lowerType.includes(activity))) {
                    return interaction.editReply({
                        content: 'Please enter a valid activity type.',
                        ephemeral: true
                    });
                }
            }

            if (!["online", "dnd", "idle", "invisible"].includes(activityvisibility)) {
                return interaction.editReply({ content: 'Invalid status!', ephemeral: true });
            }

            const [_, userId, botnumber] = interaction.customId.split('|');

            const activityData = JSON.stringify({
                type: activityType,
                text: activityText,
                visibility: activityvisibility
            });

            await queryParams(
                'UPDATE autosecure SET activity = ? WHERE user_id = ? AND botnumber = ?',
                [activityData, userId, botnumber]
            );

            const key = `${userId}|${botnumber}`;
            const c = autosecureMap.get(key);

            if (c) {
                try {
                    let activityTypeNum = 0;
                    if (activityType !== null) {
                        const lowerType = activityType.toLowerCase();
                        if (lowerType.includes('playing')) activityTypeNum = 0;
                        else if (lowerType.includes('streaming')) activityTypeNum = 1;
                        else if (lowerType.includes('listening')) activityTypeNum = 2;
                        else if (lowerType.includes('watching')) activityTypeNum = 3;
                        else if (lowerType.includes('competing')) activityTypeNum = 5;
                    }

                    await c.user.setActivity(activityText || '', { type: activityTypeNum });
                    await c.user.setStatus(activityvisibility);

                    let msg = await editbotmsg(client, interaction, botnumber, userId);
                    msg.content = "Set & saved new activity!";
                    return interaction.editReply(msg);
                } catch (err) {
                    console.error("Error setting bot presence:", err);
                    let msg = await editbotmsg(client, interaction, botnumber, userId);
                    msg.content = `Error!`;
                    return interaction.editReply(msg);
                }
            } else {
                return interaction.editReply({
                    content: 'Activity saved. It should show soon!',
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error("Error in activity modal handler:", error);
            return interaction.editReply({
                content: 'An error occurred while updating your bot activity.',
                ephemeral: true
            });
        }
    }
};
