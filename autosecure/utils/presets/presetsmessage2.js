const { 
  EmbedBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ActionRowBuilder 
} = require("discord.js");
const getPreset = require("../responses/getPreset");


module.exports = async function presetsmessage2(name, ownerid, botnumber, number) {
  let presetData = await getPreset(ownerid, botnumber, name);
 // console.log(`ownerid: ${ownerid} && ${botnumber} && ${name}`)

  let embed;
  if (!presetData) {
    embed = new EmbedBuilder().setTitle(`Preset ${name}`);
  } else {
    try {
      const embedJson = JSON.parse(presetData);
      embed = Array.isArray(embedJson.embeds) ? embedJson.embeds[0] : embedJson;
      embed = EmbedBuilder.from(embed); 
    } catch (e) {
      embed = new EmbedBuilder().setTitle(`Preset ${name} (Invalid JSON)`);
    }
  }

  const title = new ButtonBuilder().setCustomId("title").setLabel("Title").setStyle(ButtonStyle.Primary);
  const description = new ButtonBuilder().setCustomId("description").setLabel("Description").setStyle(ButtonStyle.Primary);
  const author = new ButtonBuilder().setCustomId("author").setLabel("Author").setStyle(ButtonStyle.Primary);
  const authorUrl = new ButtonBuilder().setCustomId("authorurl").setLabel("Author URL").setStyle(ButtonStyle.Primary);
  const thumbnail = new ButtonBuilder().setCustomId("thumbnail").setLabel("Thumbnail").setStyle(ButtonStyle.Primary);
  const image = new ButtonBuilder().setCustomId("image").setLabel("Image").setStyle(ButtonStyle.Primary);
  const footer = new ButtonBuilder().setCustomId("footer").setLabel("Footer").setStyle(ButtonStyle.Primary);
  const footerUrl = new ButtonBuilder().setCustomId("footerurl").setLabel("Footer URL").setStyle(ButtonStyle.Primary);
  const color = new ButtonBuilder().setCustomId("color").setLabel("Color").setStyle(ButtonStyle.Primary);
  const addField = new ButtonBuilder().setCustomId("addfield").setLabel("Add Field").setStyle(ButtonStyle.Primary);
  const save = new ButtonBuilder().setCustomId(`savepreset|${name}|${ownerid}|${botnumber}|${number}`).setLabel("Save").setStyle(ButtonStyle.Success);
  const reset = new ButtonBuilder().setCustomId(`deletepreset|${name}|${ownerid}|${botnumber}`).setLabel("Reset embed to default").setStyle(ButtonStyle.Danger);
  const removeField = new ButtonBuilder().setCustomId("removefield").setLabel("Remove Field").setStyle(ButtonStyle.Danger);
  const importJson = new ButtonBuilder().setCustomId(`embedjson|${name}|preset`).setLabel("Import").setStyle(ButtonStyle.Secondary);
  const exportJson = new ButtonBuilder().setCustomId("exportjson").setLabel("Export").setStyle(ButtonStyle.Secondary);

  const components = [
    new ActionRowBuilder().addComponents(title, description, author, authorUrl, thumbnail),
    new ActionRowBuilder().addComponents(image, footer, footerUrl, color, addField),
    new ActionRowBuilder().addComponents(save, reset, removeField, importJson, exportJson),
  ];

  return {
    embeds: [embed],
    components: components,
    ephemeral: true
  };
};
