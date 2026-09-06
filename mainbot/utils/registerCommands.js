const { REST, Routes } = require("discord.js");
const fs = require("fs");

const logCommand = (message) => {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    fs.appendFileSync("command_logs.txt", logMessage);
};

module.exports = async (clientid, commands, token) => {
    const rest = new REST().setToken(token);
    try {
        // Validate commands before sending
        for (let i = 0; i < commands.length; i++) {
            const cmd = commands[i];
            if (!cmd.name || !cmd.description) {
                console.error(`[COMMAND ERROR] Command at index ${i} is missing required fields:`, JSON.stringify(cmd, null, 2));
                throw new Error(`Command at index ${i} is missing name or description`);
            }
        }
        
        await rest.put(
            Routes.applicationCommands(clientid),
            { body: commands }
        );
        console.log(`✅ Successfully registered ${commands.length} commands`);
    } catch (error) {
        console.error('❌ Failed to register commands:');
        if (error.rawError?.errors) {
            console.error('Validation errors:', JSON.stringify(error.rawError.errors, null, 2));
        }
        console.error(error);
        throw error;
    }
};
