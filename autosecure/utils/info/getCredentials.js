const HttpClient = require("../process/HttpClient");
const getLiveData = require("../secure/getLiveData");

module.exports = async (email, sendotp = true) => {
  try {
    // Step 1: Get cookies + PPFT from getLiveData.js
    const liveData = await getLiveData();
    if (!liveData) {
      console.error("❌ Failed to fetch liveData (cookies/PPFT)");
      return null;
    }

    const { cookies, ppft } = liveData;

    // Step 2: Use HttpClient with those cookies
    let axios = new HttpClient();

    console.log(">>> Using PPFT:", ppft.substring(0, 40) + "...");
    console.log(">>> Using Cookies:", cookies.substring(0, 80) + "...");

    // Step 3: Try GetCredentialType.srf
    const response = await axios.post(
      "https://login.live.com/GetCredentialType.srf",
      {
        checkPhones: true,
        federationFlags: 3,
        flowToken: ppft,
        forceotclogin: sendotp ? true : false,
        isFidoSupported: true,
        isOtherIdpSupported: false,
        isRemoteConnectSupported: false,
        isRemoteNGCSupported: true,
        otclogindisallowed: false,
        username: email,
      },
      {
        headers: {
          Cookie: cookies,
          "Content-Type": "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "application/json",
          "Accept-Language": "en-US,en;q=0.9",
        },
      }
    );

    console.log(">>> STATUS:", response.status);
    console.log(">>> BODY:", JSON.stringify(response.data, null, 2));

    // Detect available auth methods and avoid false fallback
    const creds = response?.data?.Credentials || {};
    const hasOTP = Array.isArray(creds.OtcLoginEligibleProofs) && creds.OtcLoginEligibleProofs.length > 0;
    const hasNGC = !!creds.RemoteNgcParams; // can be an object, not necessarily an array
    const hasPassword = creds.HasPassword === 1 || creds.HasPassword === true;
    const hasFido = creds.HasFido === 1 || creds.HasFido === true;

    console.log(`🔎 Detected capabilities -> Password: ${hasPassword}, FIDO/WebAuthn: ${hasFido}, RemoteNGC: ${hasNGC}, OTP proofs: ${hasOTP}`);

    if (hasOTP || hasNGC || hasPassword || hasFido) {
      console.log(`✅ Proceeding with detected capability (priority: OTP > NGC > Password > FIDO)`);
      return response.data;
    } else {
      console.log(
        "⚠️ Didn't find credentials in primary flow (no OTP/NGC/Password/FIDO detected), falling back..."
      );
    }

    // Step 4: Fallback
    const fallbackRes = await axios.get(
      `https://login.live.com/oauth20_authorize.srf?client_id=4765445b-32c6-49b0-83e6-1d93765276ca&scope=openid&redirect_uri=https://www.office.com/landingv2&response_type=code&msproxy=1&username=${email}`,
      {
        headers: {
          Cookie: cookies,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
      }
    );

    const credentialsString = fallbackRes.data.match(
      /{"Username":.+?}(?=,loader:\{)/
    )?.[0];

    if (credentialsString) {
      try {
        return JSON.parse(credentialsString);
      } catch {
        console.error("❌ Failed to parse credentialsString");
        return null;
      }
    } else {
      return null;
    }
  } catch (err) {
    console.error("❌ getCredentials failed:", err.message);
    return null;
  }
};
