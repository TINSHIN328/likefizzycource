const makePrimary = require("../secure/makePrimary")
const addAlias = require("../secure/addAlias")
const removeAlias = require("../secure/removeAlias")
const {
    updateStatus,
    updateExtraInformation,
    logDuration,
    getAcc,
    initializesecure,
    newgamertag,
    generateValidGamertag
} = require("../process/helpers");
const generate = require("../generate")

module.exports = async function aliasses(
    axios,
    canary2,
    uid,
    acc,
    aliases,
    primary,
    settings,
    apicanary,
    cookiedata,
    amsc
) {

    console.log(`Got into alias!`)


    console.log(`Aliasses canary: ${apicanary}`)
    console.log(`Canary 2: ${canary2}`)
    if (settings.changeprimary === 1) {
        let primaryAlias = generate(16)
        let isAdded = await addAlias(primaryAlias, canary2, cookiedata.cookies.amrp, amsc);

        if (isAdded) {
            console.log(`[✔] Added alias ${primaryAlias}@outlook.com to the Account!`);
            let email = primaryAlias + "@outlook.com";
            let isPrimary = await makePrimary(cookiedata, email, apicanary, amsc);

            if (isPrimary) {
                acc.email = email;
                await updateStatus(uid, "email", acc.email);
                console.log(`[✔] Set ${primaryAlias}@outlook.com as a Primary Alias for the Account!`);

                await Promise.all(aliases.map(async (alias) => {
                    if (!alias || typeof alias !== 'string') return;
                    await removeAlias(axios, alias, canary2);
                }));
            } else {
                console.log(`[X] Failed to Set ${primaryAlias}@outlook.com as a Primary Alias for the Account!`);
                await Promise.all(aliases.map(async (alias) => {
                    if (!alias || typeof alias !== 'string' || alias.includes(primary)) return;
                    await removeAlias(axios, alias, canary2);
                }));
            }
        } else {
            console.log(`[X] Failed to add ${primaryAlias}@outlook.com as an Alias for the Account!`);
            acc.email = primary;
            await updateStatus(uid, "email", acc.email);
            await Promise.all(aliases.map(async (alias) => {
                if (!alias || typeof alias !== 'string' || alias === primary) return;
                await removeAlias(axios, alias, canary2);
            }));
        }
    } else if (settings.changeprimary === 0) {
        console.log(`[*] Removing non-primary aliases as changeprimary is disabled`);
        await Promise.all(aliases.map(async (alias) => {
            if (!alias || typeof alias !== 'string' || alias === primary) return;
            await removeAlias(axios, alias, canary2);
        }));
        await updateStatus(uid, "email", acc.email);
    } else if (settings.changeprimary === 2) {
        console.log(`[*] Keeping current primary alias (changeprimary mode 2: keep current)`);
        // State 2: Don't change primary, but still remove non-primary aliases
        await Promise.all(aliases.map(async (alias) => {
            if (!alias || typeof alias !== 'string' || alias === primary) return;
            await removeAlias(axios, alias, canary2);
        }));
        await updateStatus(uid, "email", acc.email);
    }

    return acc
}
