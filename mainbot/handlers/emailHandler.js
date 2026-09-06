const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');
const { queryParams } = require("../../db/database");
const embedWrapper = require("../utils/emails/embedWrapper");
const { ignoreEmails } = require("../../config.json");
const EventEmitter = require('events');
const config = require('../../config.json');

// --- Config ---
const SMTP_PORT = config.smtpPort || 2525;
const SMTP_HOST = config.smtpHost || '0.0.0.0'; // Listen on all interfaces
const emailWatchers = new Map();
let client = null; // Discord client (set via initialize)

// --- SMTP Server Setup ---
const smtpServer = new SMTPServer({
    logger: true, // Enable logging
    disabledCommands: ['AUTH'], // Disable authentication (if not needed)
    onData(stream, session, callback) {
        simpleParser(stream)
            .then(parsed => processIncomingEmail(parsed))
            .then(() => callback())
            .catch(err => {
                console.error('Error processing email:', err);
                callback(err);
            });
    },
    onConnect(session, callback) {
        console.log(`New SMTP connection from ${session.remoteAddress}`);
        callback(); // Accept the connection
    },
});

// --- Functions ---
function initialize(discordClient) {
    client = discordClient;
    console.log('📧 Email handler initialized with Discord client');
    startSMTPServer();
}

function startSMTPServer() {
    smtpServer.listen(SMTP_PORT, SMTP_HOST, () => {
        console.log(`✅ SMTP server running on ${SMTP_HOST}:${SMTP_PORT}`);
        console.log(`📧 Email handler ready to receive emails`);
    });

    smtpServer.on('error', (err) => {
        console.error('❌ SMTP server error:', err.message);
        console.log('🔄 Attempting to restart SMTP server in 5 seconds...');
        setTimeout(startSMTPServer, 5000); // Reconnect after 5s
    });
}

async function processIncomingEmail(parsed) {
    const { from, to, subject, text, date } = parsed;
    const recipient = to.value[0].address;
    const sender = from.value[0].address;

    if (ignoreEmails.includes(sender)) {
        console.log(`🚫 Ignoring email from ${sender} (in ignore list)`);
        return;
    }

    const code = extractVerificationCode(text);
    console.log(`📩 New email: ${sender} → ${recipient}${code ? ` (code: ${code})` : ''}`);

    // Notify watchers (if any)
    if (emailWatchers.has(recipient)) {
        emailWatchers.get(recipient)({
            text,
            time: date || Date.now(),
        });
    }

    // Store in DB
    await storeEmail(recipient, sender, subject, text, date || Date.now());

    // Send Discord notifications (if client is available)
    if (client) {
        await sendNotifications(recipient, parsed);
    }
}

function extractVerificationCode(text) {
    // Clean the text - remove HTML tags and normalize whitespace
    const cleanText = text
        .replace(/<[^>]*>/g, ' ') // Remove HTML tags
        .replace(/&nbsp;/g, ' ') // Replace &nbsp; with space
        .replace(/&amp;/g, '&') // Replace &amp; with &
        .replace(/&lt;/g, '<') // Replace &lt; with <
        .replace(/&gt;/g, '>') // Replace &gt; with >
        .replace(/&quot;/g, '"') // Replace &quot; with "
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim();
    
    console.log(`🔍 Extracting verification code from text (length: ${cleanText.length})`);
    console.log(`📝 Text preview: ${cleanText.substring(0, 300)}...`);
    
    // Multiple patterns to catch different code formats
    const patterns = [
        // Microsoft specific patterns
        /security[^0-9]*code[^0-9]*([0-9]{6,7})/i,
        /verification[^0-9]*code[^0-9]*([0-9]{6,7})/i,
        /one[^0-9]*time[^0-9]*code[^0-9]*([0-9]{6,7})/i,
        /use[^0-9]*this[^0-9]*code[^0-9]*([0-9]{6,7})/i,
        /enter[^0-9]*this[^0-9]*code[^0-9]*([0-9]{6,7})/i,
        /your[^0-9]*code[^0-9]*is[^0-9]*([0-9]{6,7})/i,
        /code[^0-9]*is[^0-9]*([0-9]{6,7})/i,
        /otp[^0-9]*code[^0-9]*([0-9]{6,7})/i,
        
        // Generic patterns
        /\b\d{6,7}\b/, // 6-7 digit codes
        /[0-9]{6,7}/, // Any 6-7 digit sequence
        /code[:\s]*([0-9]{6,7})/i, // "code: 123456" format
        /verification[:\s]*([0-9]{6,7})/i, // "verification: 123456" format
        /otp[:\s]*([0-9]{6,7})/i, // "otp: 123456" format
        /([0-9]{6,7})[^0-9]/, // 6-7 digits followed by non-digit
        
        // Microsoft account specific patterns
        /microsoft[^0-9]*account[^0-9]*([0-9]{6,7})/i,
        /sign[^0-9]*in[^0-9]*code[^0-9]*([0-9]{6,7})/i,
        /login[^0-9]*code[^0-9]*([0-9]{6,7})/i
    ];
    
    for (let i = 0; i < patterns.length; i++) {
        const pattern = patterns[i];
        const match = cleanText.match(pattern);
        if (match) {
            const code = match[1] || match[0];
            const cleanCode = code.replace(/[^0-9]/g, ""); // Strip non-digits
            
            if (cleanCode.length >= 6 && cleanCode.length <= 7) {
                console.log(`✅ Extracted verification code: ${cleanCode} using pattern ${i + 1} (${pattern})`);
                return cleanCode;
            }
        }
    }
    
    // Try to find any 6-7 digit sequence in the entire text as last resort
    const allNumbers = cleanText.match(/\d+/g);
    if (allNumbers) {
        for (const num of allNumbers) {
            if (num.length >= 6 && num.length <= 7) {
                console.log(`✅ Found code in numbers: ${num}`);
                return num;
            }
        }
    }
    
    console.log("❌ No verification code found in email text");
    return null;
}

async function storeEmail(email, from, subject, text, time) {
    try {
        await queryParams(
            `INSERT INTO emails(receiver, sender, subject, description, time) VALUES(?, ?, ?, ?, ?)`,
            [email, from, subject, text, time]
        );
    } catch (err) {
        console.error('Failed to store email:', err);
    }
}

async function sendNotifications(email, parsed) {
    try {
        const subscribers = await queryParams(
            `SELECT user_id FROM email_notifier WHERE email = ?`,
            [email]
        );

        if (!subscribers?.length) return;

        for (const sub of subscribers) {
            try {
                const discordUser = await client.users.fetch(sub.user_id);
                if (discordUser) {
                    await discordUser.send({
                        content: `📧 New email to **${email}**`,
                        embeds: [embedWrapper(parsed.subject, parsed.text)],
                    });
                }
            } catch (err) {
                console.error(`Failed to DM user ${sub.user_id}:`, err.message);
            }
        }
    } catch (err) {
        console.error('Error sending notifications:', err);
    }
}

function watchForEmail(email, callback, timeout = 30000) {
    emailWatchers.set(email, callback);
    setTimeout(() => emailWatchers.delete(email), timeout);
}

function shutdown() {
    console.log('🛑 Shutting down SMTP server...');
    smtpServer.close();
}

module.exports = {
    initialize,
    watchForEmail,
    storeEmail,
    sendNotifications,
    shutdown,
};