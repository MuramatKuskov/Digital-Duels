const TelegramBot = require('node-telegram-bot-api');
const dotenv = require('dotenv').config();
const express = require('express');
const cors = require('cors');
const handleChat = require('./src/chat');
const router = require('./src/routes/index.js');
const { initWSServer } = require('./src/wss.js');
global.dictionary = require('./src/locales/dictionary.js');

const token = process.env.TELEGRAM_TOKEN;
global.bot = new TelegramBot(token, { polling: true });

const PORT = process.env.PORT;

const app = express();
// middleware парсить жсон
app.use(express.json());
// mw для кроссдоменных запросов
app.use(cors({
	// prod url
	origin: process.env.FRONTEND_URL
}));
app.use('/api', router);

function startServer() {
	try {
		const server = app.listen(PORT, () => {
			console.log(`Server has been started on port ${PORT}`);
		});
		// WS Server
		initWSServer(server);
		// Chat interface
		handleChat();
	} catch (error) {
		console.log(error);
	}
}

startServer();

