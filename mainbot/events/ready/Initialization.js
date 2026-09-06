const registerCommands = require("../../utils/registerCommands")
const getLocalCmds = require("../../utils/getLocalCmds")
const { join } = require("path")
module.exports = async (client, arg, token) => {
  try {
    let clientId = client.user.id
    const commandsfiles = getLocalCmds(join(__dirname, "..", "..", "commands"))
    let commands = []
    
    for (let commandfile of commandsfiles) {
      const { name, description, options } = commandfile
      
      if (!name) {
        console.error('[INIT ERROR] Command missing name:', commandfile);
        continue;
      }
      
      let obj = { name: name, description: description || 'No description' }
      if (options?.length > 0) {
        obj["options"] = options
      }
      commands.push(obj)
    }
    
    console.log(`Registering ${commands.length} commands for ${client.user.tag}...`)
    await registerCommands(clientId, commands, token)
    console.log(`mainbot: ${client.user.tag} (${client.user.id})`);
  } catch (error) {
    console.error('[INIT ERROR] Failed to initialize commands:', error.message);
    throw error;
  }
}