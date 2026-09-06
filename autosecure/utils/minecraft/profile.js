const HttpClient = require('../process/HttpClient');

module.exports = async (ssid) => {
  let mc = { source: null };
  let axios = new HttpClient();

  const licenses = await axios.get(
    `https://api.minecraftservices.com/entitlements/license?requestId=c24114ab-1814-4d5c-9b1f-e8825edaec1f`,
    {
      headers: {
        Authorization: `Bearer ${ssid}`,
      },
    }
  );

  let rawItems = [];
  if (licenses?.data?.items) {
    rawItems = licenses.data.items;
  }

      if (licenses?.data?.items) {
        for (let item of licenses.data.items) {
            if (item.name == "product_minecraft" || item.name == "game_minecraft") {
                if (item.source == "GAMEPASS") {
                    mc.source = "Gamepass"
                } else if (item.source == "PURCHASE" || item.source == "MC_PURCHASE") {
                    mc.source = "Purchased"
                } else {
                    console.log(`NEW WAY OF HAVING MINECRAFT??!!`)
                    console.log(item)
                }
            }
        }
    }

 // console.log("Raw Items:", rawItems);

  const seen = new Map();

  for (const item of rawItems) {
    let baseName = item.name.replace(/^product_/, '').replace(/^game_/, '');
    let prettyName;

    if (baseName === 'minecraft') {
      prettyName = 'Minecraft Java';
    } else if (baseName === 'minecraft_bedrock') {
      prettyName = 'Minecraft Bedrock';
    } else {
      prettyName = baseName.replace(/_/g, ' ').split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    }

    if (seen.has(prettyName)) {
      // Prefer MC_PURCHASE over PURCHASE
      const existing = seen.get(prettyName);
      if (existing.source === 'PURCHASE' && item.source === 'MC_PURCHASE') {
        seen.set(prettyName, { name: prettyName, source: item.source });
      }
    } else {
      seen.set(prettyName, { name: prettyName, source: item.source });
    }
  }

  const finalItems = Array.from(seen.values());


  const profile = await axios.get(
    `https://api.minecraftservices.com/minecraft/profile`,
    {
      headers: {
        Authorization: `Bearer ${ssid}`,
      },
    }
  );

  const data = profile.data;
  let capes = [];

  if (data && Array.isArray(data.capes)) {
    capes = data.capes.filter(cape => cape.alias).map(cape => cape.alias);
  }

  mc.name = data?.name || null;
  mc.uuid = data?.id || null;
  mc.capes = capes || null;
  mc.skins = data?.skins || null;
  mc.ssid = ssid;
  mc.items = finalItems;


  return mc;
};
