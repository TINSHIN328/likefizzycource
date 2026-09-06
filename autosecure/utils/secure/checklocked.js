const https = require('https');
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent'); // ✅ FIXED

module.exports = async function checklocked(email) {

 /*
  Make sure to set your proxy for checking if locked
 */
 
  let proxy = ``   // Format: username:pass:ip:port

  if (!proxy){
    console.log(`Set your proxy (has to be UK or US) in checklocked.js!`)
    return;
  }

  // Needs API Proxy
  const proxyAgent = new HttpsProxyAgent(`http://${proxy}`);

  const agent = new https.Agent({
    lookup: require('dns').lookup
  });

  try {
    const res = await axios.post(
      'https://support.microsoft.com/nl-NL/api/contactus/v1/ExecuteAlchemySAFAction?SourceApp=soc2',
      {
        Locale: 'nl-NL',
        Parameters: {
          emailaddress: email
        },
        ActionId: 'signinhelperemailv2',
        CorrelationId: '1b846a60-a752-45ee-95cb-b3ddd5b0bacd',
        ContextVariables: [],
        V2: true  
      },
      {
        httpsAgent: proxyAgent, // 
        headers: {
          'Accept': '*/*',
          'Accept-Encoding': 'gzip, deflate',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
          'Host': 'support.microsoft.com',
          'Content-Type': 'application/json'
        },
        decompress: true,
        validateStatus: () => true
      }
    );


    if (!res.data || !res.data.Value) {
      return {
        locked: "error",
        reason: "Invalid response"
      };
    }

   console.log(`Res data: ${JSON.stringify(res.data)}`)

    const parsed = JSON.parse(res.data.Value);
    const status = parsed.status || {};

return {
  locked: status.isAccountSuspended,
  compromised: status.isAccountCompromised,
  blocked: status.isAccountBlocked,
  tsvEnabled: status.tsvEnabled,
  active: status.isAccountActive,
  emailVerified: status.isEmailVerified,
  reason: status.reasonForAccountSuspension
    ? status.reasonForAccountSuspension
    : "Nothing found."
};

  } catch (err) {
    console.log(`Error checklocked.js: ${JSON.stringify(err)}`);
    return {
      locked: "error",
      reason: "Failed to check, invalid email?"
    };
  }
}


