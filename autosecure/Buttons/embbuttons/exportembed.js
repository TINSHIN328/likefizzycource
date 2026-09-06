const { AttachmentBuilder } = require("discord.js");

module.exports = {
  name: "exportjson",
  callback: async (client, interaction) => {
    try {

      const message = interaction.message;
      

      if ((!message.content || message.content === "") && 
          (!message.embeds || message.embeds.length === 0)) {
        return interaction.reply({
          content: "No content or embeds found in this message!",
          ephemeral: true
        });
      }
      

      const discohookFormat = {
        content: message.content || null,
        embeds: message.embeds.map(embed => {

          return {
            title: embed.title || null,
            description: embed.description || null,
            url: embed.url || null,
            color: embed.color || null,
            timestamp: embed.timestamp || null,
            fields: embed.fields || [],
            author: embed.author ? {
              name: embed.author.name || null,
              url: embed.author.url || null,
              icon_url: embed.author.iconURL || null
            } : null,
            footer: embed.footer ? {
              text: embed.footer.text || null,
              icon_url: embed.footer.iconURL || null
            } : null,
            image: embed.image ? {
              url: embed.image.url || null
            } : null,
            thumbnail: embed.thumbnail ? {
              url: embed.thumbnail.url || null
            } : null
          };
        })
      };
      

      const jsonData = JSON.stringify(discohookFormat, null, 2);
      

      const buffer = Buffer.from(jsonData, 'utf-8');
      

      const attachment = new AttachmentBuilder(buffer, { name: 'embed.json' });
      

      await interaction.reply({
        content: "Here's your embed JSON file:",
        files: [attachment],
        ephemeral: true
      });
      
    } catch (error) {
      console.error("Error in exportjson button:", error);
      await interaction.reply({
        content: "An error occurred while processing the message data.",
        ephemeral: true
      });
    }
  }
};