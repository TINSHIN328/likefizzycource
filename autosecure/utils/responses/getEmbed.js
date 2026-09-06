const defaultEmbeds = require("./defaultEmbeds")
const { EmbedBuilder } = require("discord.js")

module.exports = async (client, embed, var1, var2, username, email, userId) => {
    const id = client.username
    const results = await client.queryParams(`SELECT * FROM embeds WHERE user_id = ? AND type = ?`, [id, embed])
    let settings = null
    let verifymsg = null
    let alreadygotmsg = false
    let msg

    if (embed === "dm1" || embed === "dm2") {
        settings = await client.queryParams(`SELECT * FROM settings WHERE user_id = ?`, [id])
        settings = settings[0]
        verifymsg = settings?.verifymsg
        alreadygotmsg = true
        if (results.length === 0) {
            msg = defaultEmbeds(embed, client)
        }
    }

    if (results.length === 0 && !alreadygotmsg) {
        msg = defaultEmbeds(embed)
    } else if (!msg) {
        try {
            msg = JSON.parse(results[0].embed)
        } catch {
            console.log(`smth failed!`)
            return new EmbedBuilder()
                .setDescription("Failed to find the embed!")
                .setColor(0xFF0000)
        }
    }

    if (!msg) {
        console.log(`smth failed!`)
    }

    const replacements = {
        "(guildname)": var1 || "",
        "(verifymsg)": verifymsg || "verify",
        "(sec)": var1 || "",
        "{2}": var2 || "",
        "%USERNAME%": username || "",
        "%EMAIL%": email || "",
        "%USERID%": userId ? `<@${userId}>` : ""
    }

    const replacePlaceholders = (text) => {
        if (!text || typeof text !== "string") return text || ""
        let result = text
        Object.entries(replacements).forEach(([placeholder, value]) => {
            result = result.replaceAll(placeholder, value)
        })
        return result
    }

    const processObject = (obj) => {
        if (!obj || typeof obj !== "object") return obj
        if (Array.isArray(obj)) return obj.map(processObject)
        const result = {}
        for (const [k, v] of Object.entries(obj)) {
            if (typeof v === "string") {
                result[k] = replacePlaceholders(v)
            } else if (typeof v === "object" && v !== null) {
                result[k] = processObject(v)
            } else {
                result[k] = v
            }
        }
        return result
    }

    msg = processObject(msg)

    try {
        if (msg && typeof msg === "object") {
            const msgString = JSON.stringify(msg)
            const replacedString = replacePlaceholders(msgString)
            msg = JSON.parse(replacedString)
        } else if (typeof msg === "string") {
            msg = replacePlaceholders(msg)
        }
    } catch (e) {
        console.warn("Embed placeholder JSON replace failed:", e.message)
    }

    return msg
}
