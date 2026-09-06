/**
 * Utility to safely handle Discord interactions that might already be acknowledged
 * @param {Function} interactionHandler - The function to handle the interaction
 * @param {Object} interaction - Discord interaction object
 * @param {...any} args - Additional arguments to pass to the handler
 */
async function safeInteractionHandler(interactionHandler, interaction, ...args) {
    try {
        if (interaction.replied || interaction.deferred) {
            return;
        }
        await interactionHandler(interaction, ...args);
    } catch (error) {
        if (error.code === 40060) {
            // Interaction already acknowledged - ignore silently
            return;
        }
        console.error('Error in interaction handler:', error);
        
        // Try to send an error response if interaction isn't handled yet
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: 'An error occurred while processing your request.',
                    ephemeral: true
                });
            } else if (interaction.deferred) {
                await interaction.editReply({
                    content: 'An error occurred while processing your request.'
                });
            }
        } catch (replyError) {
            // If we can't send error message, just log it
            console.error('Failed to send error response:', replyError);
        }
    }
}

module.exports = safeInteractionHandler;