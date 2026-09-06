const http = require('http');
const config = require("../../config.json");
const jwt = require('jsonwebtoken');
const { handleAppealPost, handleSubmitKey } = require('./handleappealnapi.js');
const { queryParams } = require('../../db/database.js');
const { getUser } = require('../../db/usersCache.js');
const { getuserdata } = require('../../db/getuserdata.js');
const jwtsecret = config.jwtsecret;


/// Deprecated

const server = http.createServer(async (req, res) => {
    const headers = req.headers;

    if (req.url !== '/' && headers["key"] !== config.authkey) {
        const ip = req.socket.remoteAddress || 'unknown IP';
        console.log(`Unauthorized attempt by IP: ${ip}`);
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        return res.end(JSON.stringify({ error: "Unauthorized" }));
    }



    if (req.url.includes("handleappealresult")) {
        if (req.method !== 'POST') {
            res.statusCode = 405;
            res.setHeader('Content-Type', 'text/plain');
            return res.end('Only POST method is supported');
        }

        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', async () => {
            await handleAppealPost(res, body);
        });

    } else if (req.url.includes("submitkey")) {
        console.log(`Got submitkey!`);
        await handleSubmitKey(res, headers);
        if (req.method !== 'POST') {
            res.statusCode = 405;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ 
                error: true,
                message: 'Only POST method is supported for transfer'
            }));
        }

        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', async () => {
            try {
                const data = JSON.parse(body);
                const authHeader = req.headers['authorization'];
                
                if (!authHeader) {
                    res.statusCode = 401;
                    return res.end(JSON.stringify({ error: true, result: "Unauthorized" }));
                }

                const token = authHeader.split(' ')[1];
                const decoded = jwt.verify(token, jwtsecret);
                
                if (!decoded?.license) {
                    res.statusCode = 401;
                    return res.end(JSON.stringify({ error: true, result: "Couldn't validate your token!" }));
                }

                if (!data?.newUserId) {
                    res.statusCode = 400;
                    return res.end(JSON.stringify({ 
                        error: true, 
                        message: "newUserId is required" 
                    }));
                }

                const newLicenseKey = await transferLicense(decoded.license, decoded.user_id, data.newUserId);
                
                if (!newLicenseKey) {
                    res.statusCode = 400;
                    return res.end(JSON.stringify({ 
                        error: true, 
                        result: "Failed to generate new license key!" 
                    }));
                }

                const newToken = jwt.sign({ license: newLicenseKey }, jwtsecret, { expiresIn: '1h' });
                let user = await getUser(data.newUserId);

                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.setHeader('Set-Cookie', `token=${newToken}; Max-Age=3600; HttpOnly; Secure; SameSite=Strict`);

                let resultMessage =
                  user.username && user.username !== "Unknown User" && user.username !== "Couldn't fetch your discord user" && user.username !== "User Cacher isn't accessible!" && user.username !== "Invalid ID"
                    ? `Transferred your license to ${user.username} (id: ${data.newUserId}) successfully. Here's your new license key ${newLicenseKey} (Please save this, if you lose it, you cannot regain access).`
                    : `Transferred your license to id: ${data.newUserId} successfully. Here's your new license key ${newLicenseKey} (Please save this, if you lose it, you cannot regain access).`;

                res.end(JSON.stringify({
                  error: false,
                  result: resultMessage,
                  newToken: newToken
                }));

            } catch (error) {
                console.error("Transfer error:", error);
                res.statusCode = 500;
                res.end(JSON.stringify({ 
                    error: true, 
                    result: "Failed to transfer your license!" 
                }));
            }
        });

    } else {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Autosecure Endpoints are running');
    }
});

async function startserver() {
    if (config.novps === true || config.novps === "true") return;
    const basePort = Number(process.env.PORT || config.apiPort || 8080);

    const tryListen = (port, triedAlternate = false) => {
        server.listen(port, () => {
            console.log(`API server listening on port ${port}`);
        });

        const onError = (err) => {
            if (err && err.code === 'EADDRINUSE') {
                console.warn(`Port ${port} in use. ${triedAlternate ? 'Skipping API server startup.' : 'Trying next port...'}`);
                server.removeListener('error', onError);
                if (!triedAlternate) {
                    tryListen(port + 1, true);
                }
            } else if (err) {
                console.error('API server error:', err.message);
            }
        };

        server.once('error', onError);
    };

    tryListen(basePort);
}

startserver();
