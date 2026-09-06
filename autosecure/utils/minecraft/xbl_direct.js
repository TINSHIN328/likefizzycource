const axios = require('axios');
const tls = require('tls');
const { URL } = require('url');
const express = require('express');
const { Authflow, Titles } = require('prismarine-auth');
const fs = require('fs');
const path = require('path');

// --- FINAL ROBUST FLOW ---

async function getXBLTokenDirect(microsoftCookies = null) {
    try {
        console.log('🌐 Starting "Double-Hop" Flow (No Proxy)...');

        // 1. Get the MSA Token using Session Cookies
        const sisuResult = await executeSisuFlowForUserToken(microsoftCookies);

        // Safety check: Ensure we actually have a string token
        if (!sisuResult || !sisuResult.userToken || typeof sisuResult.userToken !== 'string') {
            console.log('❌ Failed to get valid Bearer Token string.');
            if(sisuResult?.userToken) console.log('   Received Type:', typeof sisuResult.userToken);
            return null;
        }

        // DEBUG: Safe logging (prevents crash)
        console.log(`✅ Got Bearer Token string (Length: ${sisuResult.userToken.length})`);

        // Return the bearer token directly
        return {
            XBL: sisuResult.userToken,
            uhs: '',
            token: sisuResult.userToken,
            userToken: sisuResult.userToken
        };

    } catch (error) {
        console.error('❌ Flow failed:', error.message);
        return null;
    }
}

// --- CORE FUNCTIONS ---

async function getUserToken(msaAccessToken) {
    try {
        const response = await axios.post(
            'https://user.auth.xboxlive.com/user/authenticate',
            {
                RelyingParty: 'http://auth.xboxlive.com',
                TokenType: 'JWT',
                Properties: {
                    AuthMethod: 'RPS',
                    SiteName: 'user.auth.xboxlive.com',
                    RpsTicket: `d=${msaAccessToken}` // Prefix d= is required
                }
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'x-xbl-contract-version': '1',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            }
        );

        return {
            token: response.data.Token,
            uhs: response.data.DisplayClaims.xui[0].uhs
        };
    } catch (error) {
        if (error.response) {
            console.error(`Error in getUserToken: ${error.response.status}`);
            // If it's 400 or 413, the token format is wrong
            console.error('Server Response:', JSON.stringify(error.response.data || {}).substring(0, 150));
        } else {
            console.error('Error in getUserToken:', error.message);
        }
        return null;
    }
}

async function exchangeForXsts(userToken, relyingParty) {
    try {
        const response = await axios.post(
            'https://xsts.auth.xboxlive.com/xsts/authorize',
            {
                Properties: {
                    SandboxId: 'RETAIL',
                    UserTokens: [userToken]
                },
                RelyingParty: relyingParty,
                TokenType: 'JWT'
            },
            {
                headers: {
                    'Content-Type': 'application/json',
                    'x-xbl-contract-version': '1',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            }
        );
        return {
            token: response.data.Token,
            uhs: response.data.DisplayClaims.xui[0].uhs
        };
    } catch (error) {
        console.error(`XSTS Exchange Error (${relyingParty}):`, error.response?.status);
        return null;
    }
}

async function executeSisuFlowForUserToken(microsoftCookies = null) {
    try {
        console.log('🔐 Using Prismarine Authflow with existing Microsoft session...');

        if (!microsoftCookies) {
            console.log('⚠️ No Microsoft cookies provided, using standard device flow...');
            return await executePrismarineDeviceFlow();
        }

        // Extract the Microsoft authentication token
        const msauth = microsoftCookies.msauth;
        const loginCookie = microsoftCookies.loginCookie;
        const authToken = msauth || loginCookie;

        if (!authToken) {
            console.log('⚠️ No valid auth token found, falling back to device flow...');
            return await executePrismarineDeviceFlow();
        }

        console.log('🔄 Setting up Prismarine with existing Microsoft session...');
        
        // Create a unique cache directory
        const cacheDir = path.join(__dirname, 'temp_cache_' + Date.now());
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }

        try {
            // Create authflow with existing Microsoft token
            const flow = new Authflow("", cacheDir, { 
                authTitle: Titles.MinecraftJava, 
                deviceType: "Win32", 
                flow: "sisu" 
            });

            // Try to use existing token by creating a mock cache entry
            const cacheFile = path.join(cacheDir, 'cache.json');
            const mockCache = {
                msa: {
                    access_token: authToken,
                    refresh_token: authToken,
                    token_type: 'Bearer',
                    expires_in: 3600
                }
            };
            
            fs.writeFileSync(cacheFile, JSON.stringify(mockCache, null, 2));

            console.log('⏳ Getting Minecraft token using existing Microsoft session...');

            const profile = await flow.getMinecraftJavaToken({ 
                fetchEntitlements: true, 
                fetchProfile: true,
                fetchCertificates: true 
            });

            const token = profile.token;
            console.log('✅ Got Minecraft Bearer Token using existing session.');

            // Clean up cache
            fs.rmSync(cacheDir, { recursive: true, force: true });

            return { userToken: token };

        } catch (error) {
            // Clean up cache on error
            if (fs.existsSync(cacheDir)) {
                fs.rmSync(cacheDir, { recursive: true, force: true });
            }
            
            console.log('⚠️ Existing session failed, trying device flow:', error.message);
            return await executePrismarineDeviceFlow();
        }

    } catch (error) {
        console.error('Prismarine session auth error:', error.message);
        return null;
    }
}

async function executePrismarineDeviceFlow() {
    try {
        console.log('🔐 Using Prismarine Device Flow (requires manual approval)...');

        // Create a unique cache directory
        const cacheDir = path.join(__dirname, 'temp_cache_' + Date.now());
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }

        const flow = new Authflow("", cacheDir, { 
            authTitle: Titles.MinecraftJava, 
            deviceType: "Win32", 
            flow: "sisu" 
        });

        console.log('⏳ Waiting for authentication... (Check your browser for Microsoft login)');

        const profile = await flow.getMinecraftJavaToken({ 
            fetchEntitlements: true, 
            fetchProfile: true,
            fetchCertificates: true 
        });

        const token = profile.token;
        console.log('✅ Got Minecraft Bearer Token.');

        // Clean up cache
        fs.rmSync(cacheDir, { recursive: true, force: true });

        return { userToken: token };

    } catch (error) {
        console.error('Prismarine Device Flow Error:', error.message);
        return null;
    }
}

async function loginWithXbox(xblToken) {
    try {
        const response = await axios.post('https://api.minecraftservices.com/authentication/login_with_xbox', {
            identityToken: `XBL3.0 x=${xblToken.uhs};${xblToken.token}`
        }, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        return response.data.access_token;
    } catch (error) {
        console.error('Login with Xbox Error:', error.response?.data || error.message);
        return null;
    }
}

// --- HELPERS ---

function rawTlsGetLocation(urlStr) {
    return new Promise((resolve) => {
        try {
            axios.get(urlStr, { maxRedirects: 0, validateStatus: s => s >= 200 && s < 400 })
                .then(r => resolve(r.headers.location))
                .catch(() => resolve(null));
        } catch (e) { resolve(null); }
    });
}

// Correct Exports
module.exports = getXBLTokenDirect;
module.exports = {
    getXBLTokenDirect,
    executeSisuFlowForUserToken
};