const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const router = express.Router();
const pino = require('pino');
const cheerio = require('cheerio');
const { Octokit } = require('@octokit/rest');
const moment = require('moment-timezone');
const Jimp = require('jimp');
const crypto = require('crypto');
const axios = require('axios');
const { sms, downloadMediaMessage } = require("./lib/msg");  // ✅ FIXED PATH
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    getContentType,
    makeCacheableSignalKeyStore,
    Browsers,
    jidNormalizedUser,
    downloadContentFromMessage,
    proto,
    prepareWAMessageMedia,
    generateWAMessageFromContent,
    S_WHATSAPP_NET
} = require('@whiskeysockets/baileys');

// ==================== CONFIGURATION ====================
const config = {
    AUTO_VIEW_STATUS: 'true',
    AUTO_LIKE_STATUS: 'true',
    AUTO_RECORDING: 'false',
    AUTO_UPDATE: 'true',
    AUTO_LIKE_EMOJI: ['💋', '🍬', '🫆', '💗', '🎈', '🎉', '🥳', '❤️', '🧫', '🐭'],
    PREFIX: '.',
    MAX_RETRIES: 3,
    GROUP_INVITE_LINK: 'https://chat.whatsapp.com/BvhbX3rns9nDlBOu46wK3a?mode=gi_t',
    ADMIN_LIST_PATH: './admin.json',
    RCD_IMAGE_PATH: 'https://ibb.co/8Lv3tn88',
    NEWSLETTER_JID: '120363424268743982@newsletter',
    NEWSLETTER_MESSAGE_ID: '428',
    OTP_EXPIRY: 300000,
    OWNER_NUMBER: '923195068309',
    OWNER_NAME: 'DR KAMRAN',
    BOT_NAME: 'KAMRAN MD MINI BOT',
    BOT_EMOJI: '😗',
    CHANNEL_LINK: 'https://whatsapp.com/channel/0029VbAhxYY90x2vgwhXJV3O',
    DEV_NAME: 'DR KAMRAN'
};

// ==================== GITHUB CONFIG (CHANGE THESE) ====================
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });  // ✅ USE ENV VARIABLE
const owner = 'silvertechx13';  // ✅ CHANGE TO YOUR USERNAME
const repo = 'SILVER-MD';       // ✅ CHANGE TO YOUR REPO NAME
const CURRENT_VERSION = '1.0.0';
const UPDATE_IMG = 'https://files.catbox.moe/ulb33v.jpg';

// ==================== REST OF YOUR CODE CONTINUES HERE ====================
// (Aage tumhara baaki ka code waisa ka waisa rahega)

const activeSockets = new Map();
const socketCreationTime = new Map();
const SESSION_BASE_PATH = './session';
const NUMBER_LIST_PATH = './numbers.json';
const otpStore = new Map();
let updateInProgress = false;

// Create session directory if not exists
if (!fs.existsSync(SESSION_BASE_PATH)) {
    fs.mkdirSync(SESSION_BASE_PATH, { recursive: true });
}

// ==================== PAIRING FUNCTION ====================
async function EmpirePair(number, res) {
    const sanitizedNumber = number.replace(/[^0-9]/g, '');
    const sessionPath = path.join(SESSION_BASE_PATH, `session_${sanitizedNumber}`);
    
    fs.ensureDirSync(sessionPath);
    
    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const logger = pino({ level: 'fatal' });
    
    try {
        const socket = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            printQRInTerminal: false,
            logger,
            browser: Browsers.macOS('Safari')
        });
        
        if (!socket.authState.creds.registered) {
            let retries = 3;
            let code;
            while (retries > 0) {
                try {
                    await delay(1500);
                    code = await socket.requestPairingCode(sanitizedNumber);
                    break;
                } catch (error) {
                    retries--;
                    await delay(2000);
                }
            }
            if (!res.headersSent) {
                res.send({ code });
            }
        }
        
        socket.ev.on('connection.update', async (update) => {
            const { connection } = update;
            if (connection === 'open') {
                console.log(`✅ Connected: ${sanitizedNumber}`);
                activeSockets.set(sanitizedNumber, socket);
                socketCreationTime.set(sanitizedNumber, Date.now());
                
                const userJid = jidNormalizedUser(socket.user.id);
                await socket.sendMessage(userJid, {
                    image: { url: config.RCD_IMAGE_PATH },
                    caption: `✅ Connected Successfully!\n\nNumber: ${sanitizedNumber}\nBot: ${config.BOT_NAME}`
                });
            }
        });
        
        socket.ev.on('creds.update', async () => {
            await saveCreds();
        });
        
    } catch (error) {
        console.error('Pairing error:', error);
        if (!res.headersSent) {
            res.status(503).send({ error: 'Service Unavailable' });
        }
    }
}

// ==================== API ROUTES ====================
router.get('/', async (req, res) => {
    const { number } = req.query;
    if (!number) {
        return res.status(400).send({ error: 'Number parameter is required' });
    }
    
    if (activeSockets.has(number.replace(/[^0-9]/g, ''))) {
        return res.status(200).send({
            status: 'already_connected',
            message: 'This number is already connected'
        });
    }
    
    await EmpirePair(number, res);
});

router.get('/ping', (req, res) => {
    res.status(200).send({
        status: 'active',
        message: `✨ ${config.BOT_NAME} is running`,
        activeSessions: activeSockets.size
    });
});

module.exports = router;
