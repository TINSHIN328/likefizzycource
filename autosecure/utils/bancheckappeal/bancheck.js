const mineflayer = require('mineflayer');
const fetch = require('node-fetch');
const axios = require("axios");

async function checkIfUserIsOnline(uuid) {
    try {
        const response = await axios({
            method: "GET",
            url: `https://hypixel.paniek.de/player/${uuid}/status`,
        });
        return response?.data?.status?.online === true;
    } catch (error) {
        // console.error('Error fetching player status:', error.message);
        return false;
    }
}

async function attemptConnection(username, uuid, ssid) {
    return new Promise((resolve, reject) => {
        const botOptions = {
            host: 'mc.hypixel.net',
            port: 25565,
            version: '1.8.9',
            username: username,
            session: {
                accessToken: ssid,
                clientToken: uuid,
                selectedProfile: {
                    id: uuid,
                    name: username,
                },
            },
            auth: 'mojang',
            skipValidation: true,
        };

        const bot = mineflayer.createBot(botOptions);
        let timeout;

        bot.once('spawn', () => {
            // console.log(`Bot logged into Hypixel as ${username}`);

            timeout = setTimeout(() => {
                // console.log('Successfully stayed connected for 2.0 seconds without being kicked.');
                bot.end();
                resolve({ status: 'unbanned', username, uuid });
            }, 2000);
        });

        bot.on('kicked', (reason) => {
            clearTimeout(timeout);
            bot.end();
            resolve({ status: 'kicked', reason, username, uuid });
        });

        bot.on('end', () => {
            clearTimeout(timeout);
        });

        bot.on('error', (error) => {
            clearTimeout(timeout);
            bot.end();
            reject(error);
        });
    });
}

function parseBanTime(timeStr) {
    let seconds = 0;
    const matches = timeStr.match(/\d+[dhms]/g) || [];

    matches.forEach(match => {
        const value = parseInt(match);
        switch(match.slice(-1)) {
            case 'd': seconds += value * 86400; break;
            case 'h': seconds += value * 3600; break;
            case 'm': seconds += value * 60; break;
            case 's': seconds += value; break;
        }
    });

    return seconds > 0 ? Math.floor(Date.now() / 1000) + seconds : null;
}

function getBanId(text) {
    const fullText = text.toLowerCase();
    let banIdMatch = fullText.match(/ban id: (#[a-z0-9]+)/i);
    if (!banIdMatch) banIdMatch = fullText.match(/block id: (#[a-z0-9]+)/i);
    if (!banIdMatch) banIdMatch = fullText.match(/#([a-z0-9]+)\b/);
    return banIdMatch ? (banIdMatch[1].startsWith('#') ? banIdMatch[1] : `#${banIdMatch[1]}`) : null;
}

function parseBanReason(reason, profile) {
    try {
        const reasonJson = typeof reason === 'string' ? JSON.parse(reason) : reason;
        const fullText = reasonJson.extra ? reasonJson.extra.map(e => e.text).join('').toLowerCase() : '';
        // console.log(fullText);

        // Handle invalid username
        if (fullText.includes('failed to authenticate')){
                return { 
                banId: null, 
                banReason: 'Failed to authenticate your connection, invalid ssid?',
                unbanTime: null,
                ban: `Couldn't check ban:`,
                username: profile?.name || null,
                uuid: profile?.id || null
            };
        }
        
        if (fullText.includes('you logged in from another location') || fullText.includes('disconnected')) {
            return { 
                banId: null, 
                banReason: 'online',
                unbanTime: null,
                ban: `Couldn't check ban:`,
                username: profile?.name || null,
                uuid: profile?.id || null
            };
        }
        
        if (fullText.includes('closed')) {
            return { 
                banId: null, 
                banReason: null, 
                unbanTime: null,
                ban: false,
                username: profile?.name || null,
                uuid: profile?.id || null
            };
        }
        
        // Parse ban details
        const banId = getBanId(fullText);
        let banReason = 'unknown';
        let unbanTime = null;

        const timeMatch = fullText.match(/(\d+[dhms]\s*)+/);
        if (timeMatch) {
            unbanTime = parseBanTime(timeMatch[0]);
        }

        if (fullText.includes('blocked') || fullText.includes('permanent')) {
            unbanTime = 'never';
        }

        if (fullText.includes('suspicious activity has been detected on your account')) {
            banReason = 'security';
        } else if (fullText.includes('cheating through the use of unfair game advantages')) {
            banReason = 'cheating';
        } else if (fullText.includes('boosting detected')) {
            banReason = 'sbboosting';
        } else if (fullText.includes('boosting to')) {
            banReason = 'boosting';
        } else if (fullText.includes('extreme chat infraction')) {
            banReason = 'chat';
        } else if (fullText.includes('team')) {
            banReason = 'teaming';
        } else if (fullText.includes(`your account's security appeal was processed and the account has entered a recovery phase`)) {
            banReason = 'already appealed';
        }

        return { 
            banId, 
            banReason, 
            unbanTime, 
            ban: true,
            username: profile?.name || null,
            uuid: profile?.id || null,
            banTimeFormatted: unbanTime === 'never' ?
                'Permanent' :
                (unbanTime ? new Date(unbanTime * 1000).toLocaleString() : 'Unknown duration')
        };
    } catch (e) {
        // console.error('Failed to parse ban reason:', e);
        return { 
            banId: null, 
            banReason: 'error', 
            unbanTime: null,
            ban: `Couldn't check ban:`,
            username: profile?.name || null,
            uuid: profile?.id || null
        };
    }
}

async function getProfileData(sessionId) {
    try {
        const response = await fetch('https://api.minecraftservices.com/minecraft/profile', {
            headers: {
                'Authorization': `Bearer ${sessionId}`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0',
                'Accept': '*/*',
                'Accept-Language': 'nl,en-US;q=0.7,en;q=0.3',
                'Origin': 'https://www.minecraft.net',
                'Referer': 'https://www.minecraft.net/'
            }
        });

        if (!response.ok) return null;
        const data = await response.json();
        return data?.id && data?.name ? { id: data.id, name: data.name } : null;
    } catch (error) {
        // console.error('Profile fetch error:', error.message);
        return null;
    }
}

async function banchecker(username, uuid, ssid, retries = 1) {
    let lastError = null;
    
    // Check if user is online first
    const isOnline = await checkIfUserIsOnline(uuid);
    if (isOnline) {
        return { 
            status: 'online',
            username, 
            uuid 
        };
    }

    for (let attempt = 0; attempt <= retries; attempt++) {
        // console.log(`Attempt ${attempt + 1}/${retries + 1}`);

        try {
            const result = await attemptConnection(username, uuid, ssid);
            
            if (result.status === 'unbanned') {
                return { status: 'unbanned', username, uuid };
            }
            
            if (result.status === 'kicked') {
                return result;
            }

            lastError = new Error('Unknown connection result');
        } catch (error) {
            lastError = error;
            // console.error(`Attempt ${attempt + 1} failed:`, error.message);
            
            // Check for multiplayer off error
            if (error.message && error.message.toLowerCase().includes('insufficient')) {
                // console.log('Multiplayer is off!');
                return { 
                    status: 'error', 
                    error: 'Multiplayer is off', 
                    username, 
                    uuid 
                };
            }

            if (attempt < retries) {
                // console.log('Retrying...');
                await new Promise(resolve => setTimeout(resolve, 1000)); // Delay between retries
            }
        }
    }

    throw lastError || new Error('All connection attempts failed');
}

async function bancheck(ssid) {
    // Get profile data from session ID
    const profile = await getProfileData(ssid);
    if (!profile) {
        return { 
            banReason: 'invalid_token', 
            ban: `Couldn't check ban:` 
        };
    }

    try {
        const result = await banchecker(profile.name, profile.id, ssid, 1);
        // console.log(`Result: ${JSON.stringify(result)}`);
        
        if (result.status === 'online') {
            return {
                banReason: 'User is online!',
                ban: `Couldn't check ban:`,
                username: profile.name,
                uuid: profile.id
            };
        } else if (result.status === 'unbanned') {
            return {
                ban: false,
                username: profile.name,
                uuid: profile.id
            };
        } else if (result.status === 'kicked') {
            return parseBanReason(result.reason, profile);
        } else if (result.status === 'error') {
            return {
                banReason: result.error || 'error',
                ban: `Couldn't check ban:`,
                username: profile.name,
                uuid: profile.id
            };
        }
    } catch (error) {
        if (error.message && error.message.toLowerCase().includes('insufficient')) {
            return {
                ban: `Couldn't check ban:`,
                banReason: "multiplayer",
                username: profile.name,
                uuid: profile.id
            };
        }

        // Handle invalid UUID
        if (error.message && error.message.toLowerCase().includes('invalid profileid')) {
            return {
                ban: `Couldn't check ban:`,
                banReason: "Invalid UUID, couldn't logon to Hypixel. Maybe the name on this SSID just changed?",
                username: profile.name,
                uuid: profile.id
            };
        }

        if (error.message && error.message.toLowerCase().includes('forbiddenoperationexception')) {
            return {
                ban: `Couldn't check ban:`,
                banReason: "Invalid SSID!",
                username: profile.name,
                uuid: profile.id
            };
        }
        
        // Handle timeout
        if (error.message === 'Timeout') {
            return {
                ban: `Couldn't check ban:`,
                banReason: 'timeout',
                username: profile.name,
                uuid: profile.id
            };
        }

        return {
            ban: `Couldn't check ban:`,
            banReason: "error",
            username: profile.name,
            uuid: profile.id
        };
    }
}

module.exports = { bancheck };