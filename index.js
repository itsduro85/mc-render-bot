const mineflayer = require('mineflayer');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 10000;

// Keep-Alive Web Server for Render
app.get('/', (req, res) => {
    res.send('Minecraft AFK Bot is alive and running!');
});

app.listen(PORT, () => {
    console.log(`Web server listening on port ${PORT}`);
});

// Minecraft Bot Configuration
const botArgs = {
    host: 'mcplaytime.mcsh.io',       // Your server IP
    port: 13897,                      // Your custom port number
    username: 'Proxity_AFK',          // The name your bot will use in-game
    version: false                    // Tells mineflayer to auto-negotiate with your 26.1.2 server protocol
};

let bot;

function createBot() {
    bot = mineflayer.createBot(botArgs);

    bot.on('spawn', () => {
        console.log('Bot successfully spawned in the server.');
        
        // Anti-AFK routine every 15 seconds to bypass kick timers
        setInterval(() => {
            if (bot && bot.entity) {
                bot.setControlState('jump', true);
                setTimeout(() => bot.setControlState('jump', false), 500);
                
                const yaw = (Math.random() * 3.6) - 1.8;
                const pitch = (Math.random() * 1.8) - 0.9;
                bot.look(yaw, pitch);
            }
        }, 15000);
    });

    bot.on('chat', (username, message) => {
        if (username === bot.username) return;
        console.log(`Chat - ${username}: ${message}`);
    });

    bot.on('end', () => {
        console.log('Bot disconnected. Reconnecting in 10 seconds...');
        setTimeout(createBot, 10000);
    });

    bot.on('error', (err) => {
        console.log('Bot encountered an error: ', err);
    });
}

createBot();
