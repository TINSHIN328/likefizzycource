const axios = require('axios');
const { fetchPlayerData } = require('./fetchPlayerData');

module.exports = async (username) => {
  try {
    let uuid;

    const res1 = await axios({
      url: `https://api.mojang.com/users/profiles/minecraft/${username}`,
      method: "get",
      maxRedirects: 0,
      validateStatus: status => status >= 200 && status < 510,
    });
    uuid = res1?.data?.id || null;
    if (uuid) {
      // console.log(`UUID from Mojang API: ${uuid}`);
    }

    if (!uuid) {
      const res2 = await axios.get(`https://playerdb.co/api/player/minecraft/${username}`);
      if (res2?.data?.code === "player.found" && res2.data?.data?.player?.raw_id) {
        uuid = res2.data.data.player.raw_id;
        // console.log(`UUID from playerdb.co: ${uuid}`);
      }
    }

    if (!uuid) {
      const playerData = await fetchPlayerData(username);
      if (playerData?.uuid) {
        uuid = playerData.uuid;
        // console.log(`UUID from fetchPlayerData: ${uuid}`);
      }
    }

    return uuid || null;
  } catch {
    return null;
  }
};
