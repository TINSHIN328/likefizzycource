const HttpClient = require('../process/HttpClient');

function normalizeXbl3(xbl) {
    if (!xbl || typeof xbl !== 'string') return null;
    let trimmed = xbl.trim();
    const PREFIX = 'XBL3.0 x=';

    if (trimmed.startsWith(PREFIX)) {
        while (trimmed.startsWith(PREFIX + PREFIX)) {
            trimmed = trimmed.slice(PREFIX.length);
        }
        return trimmed;
    }
    const barePattern = /^[^;]+;ey[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+$/;
    if (barePattern.test(trimmed)) return `${PREFIX}${trimmed}`;

    const lastIdx = trimmed.lastIndexOf(PREFIX);
    if (lastIdx !== -1) {
        const payload = trimmed.slice(lastIdx + PREFIX.length);
        return `${PREFIX}${payload}`;
    }

    return trimmed;
}

function parseXErr(resp) {
    try {
        const hdr = resp?.headers?.['www-authenticate'] || resp?.headers?.['WWW-Authenticate'];
        if (!hdr || typeof hdr !== 'string') return null;
        const m = hdr.match(/XErr=([0-9]+)/i);
        return m ? m[1] : null;
    } catch { return null; }
}

async function postLoginWithXbox(client, identityToken) {
    return client.post(
        'https://api.minecraftservices.com/authentication/login_with_xbox',
        { identityToken },
        { headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Cache-Control': 'no-store' } }
    );
}

module.exports = async (xbl) => {
    try {
        const client = new HttpClient();
        const identityToken = normalizeXbl3(xbl);
        if (!identityToken) {
            console.log('getssid: invalid XBL identity token input');
            return null;
        }

        // Attempt 1: minimal payload
        let resp = await postLoginWithXbox(client, identityToken);
        if (resp?.data?.access_token) return resp.data.access_token;

        // Attempt 2: legacy flags
        let resp2 = await client.post(
            'https://api.minecraftservices.com/authentication/login_with_xbox',
            { identityToken: identityToken, ensureLegacyEnabled: true, platform: 'WEB' },
            { headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'Cache-Control': 'no-store' } }
        );
        if (resp2?.data?.access_token) return resp2.data.access_token;

        // If 401, short delay and one more retry with minimal payload
        if ((resp?.status === 401 || resp2?.status === 401)) {
            const xerr = parseXErr(resp2) || parseXErr(resp);
            if (xerr) console.log(`getssid: 401 WWW-Authenticate XErr=${xerr}`);
            console.log('getssid: 401 from login_with_xbox, retrying once...');
            await new Promise(r => setTimeout(r, 800));
            const retry = await postLoginWithXbox(client, identityToken);
            if (retry?.data?.access_token) return retry.data.access_token;
            console.log('getssid retry still 401', retry?.status, parseXErr(retry));
        }

        console.log('getssid: login_with_xbox failed', { s1: resp?.status, s2: resp2?.status },
            typeof (resp2?.data || resp?.data) === 'object' ? JSON.stringify(resp2?.data || resp?.data).slice(0, 400) : (resp2?.data || resp?.data));
    } catch (e) {
        console.log('getssid error:', e?.response?.data || e.message || e);
    }
    return null;
}