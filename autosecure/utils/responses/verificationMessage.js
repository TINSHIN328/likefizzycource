const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { queryParams } = require("../../../db/database");
const defaultEmbeds = require("./defaultEmbeds");

module.exports = async (client, userid, type, botnumber) => {

// USERID: Owner ID


    let d = false;
    let botnumber2;


    /*
    Double-Check
    */
    if (botnumber){
        botnumber2 = botnumber
    } else {
        botnumber2 = client.botnumber
    }


    /// Not needed embedjson
    // Save and delete need to be specified, done

    const title = new ButtonBuilder().setCustomId("title").setLabel("Title").setStyle(ButtonStyle.Primary);
    const description = new ButtonBuilder().setCustomId("description").setLabel("Description").setStyle(ButtonStyle.Primary);
    const author = new ButtonBuilder().setCustomId("author").setLabel("Author").setStyle(ButtonStyle.Primary);
    const authorUrl = new ButtonBuilder().setCustomId("authorurl").setLabel("Author URL").setStyle(ButtonStyle.Primary);
    const thumbnail = new ButtonBuilder().setCustomId("thumbnail").setLabel("Thumbnail").setStyle(ButtonStyle.Primary);
    const color = new ButtonBuilder().setCustomId("color").setLabel("Color").setStyle(ButtonStyle.Primary);
    const imageUrl = new ButtonBuilder().setCustomId("image").setLabel("Image").setStyle(ButtonStyle.Primary);
    const footer = new ButtonBuilder().setCustomId("footer").setLabel("Footer").setStyle(ButtonStyle.Primary);
    const footerUrl = new ButtonBuilder().setCustomId("footerurl").setLabel("Footer URL").setStyle(ButtonStyle.Primary);
    const save = new ButtonBuilder().setCustomId(`save|${type}|${botnumber2}|${userid}`).setLabel("Save").setStyle(ButtonStyle.Success);
    const del = new ButtonBuilder().setCustomId(`delete|${type}|${botnumber2}|${userid}`).setLabel("Delete").setStyle(ButtonStyle.Danger);
    const embedjson = new ButtonBuilder().setCustomId(`embedjson|${type}|verification|${botnumber2}`).setLabel("Import").setStyle(ButtonStyle.Secondary);
    const exportjson = new ButtonBuilder().setCustomId("exportjson").setLabel("Export").setStyle(ButtonStyle.Secondary);
    const addfield = new ButtonBuilder().setCustomId("addfield").setLabel("Add Field").setStyle(ButtonStyle.Primary);
    const removefield = new ButtonBuilder().setCustomId("removefield").setLabel("Remove Field").setStyle(ButtonStyle.Danger);
    const placeholder = new ButtonBuilder().setCustomId(`placeholder|${type}`).setLabel("Placeholders").setStyle(ButtonStyle.Secondary);

    let msg = { content: "" };

        if (type === 'listaccount' || type === 'invalidated' || type.startsWith('dm') || type === "statsmsg") {
        d = true;
        }


    if (type === 'nomc') {
        msg.content = "This embed will only be shown when secure fake accounts is `disabled`.";
    }

    let embed = await queryParams(
        `SELECT * FROM embeds WHERE user_id=? AND type=? AND botnumber=?`,
        [userid, type, botnumber2]
    );


    if (embed.length === 0) {
        embed = defaultEmbeds(type, client);
    } else {
        embed = JSON.parse(embed[0].embed);
    }

    const components = [
        new ActionRowBuilder().addComponents(title, description, author, authorUrl, thumbnail),
        new ActionRowBuilder().addComponents(imageUrl, footer, footerUrl, color, addfield),
        new ActionRowBuilder().addComponents(save, del, removefield, embedjson, exportjson)
    ];

    if (d) {
        components.push(new ActionRowBuilder().addComponents(placeholder));
    }

    return {
        content: msg.content,
        embeds: [embed],
        components: components,
        ephemeral: true
    };
};
