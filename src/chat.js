const { createChatSession, getChatSession, setChatSession } = require("./sessions/ChatSessions");

function handleChat() {
	setListeners();
}

function setListeners() {
	bot.on("message", handleMessage)
	bot.on("callback_query", handleCallback);
}

async function handleMessage(msg) {
	const chatId = msg.chat.id;
	const session = getChatSession(msg.from.id) || createChatSession({ id: msg.from.id, username: msg.from.username });

	if (msg.text === "/start") {
		return await bot.sendMessage(chatId,
			`Welcome to Digital Duels — area of exciting and fair competition! 🎉
Select language of your interaction with the bot. 🌐

Вітаємо у Digital Duels — території захоплюючої та справедливої конкуренції! 🎉
Оберіть мову спілкування з ботом. 🌐`,
			{
				reply_markup: {
					inline_keyboard: [
						[{ text: "🇬🇧 en", callback_data: "en" }],
						[{ text: "🇺🇦 ua", callback_data: "ua" }],
					]
				}
			}
		);
	} else if (msg.text === "/help") {
		await bot.sendMessage(chatId, dictionary.help[`${session.language}`]);
		setChatSession(msg.from.id, { isPromptedForFeedback: true });
	} else if (session.isPromptedForFeedback) {
		setChatSession(msg.from.id, { isPromptedForFeedback: false });
	} else {
		// setChatSession(msg.from.id, { unexpectedMessagesInARow: session.unexpectedMessagesInARow + 1 });
		// await bot.sendMessage(chatId, dictionary.unexpectedMessage[`${session.language}`]);
		await bot.sendMessage(chatId, dictionary.help[`${session.language}`]);
	}

	// Mongoose search
	// User.aggregate([{
	// 	$search: {
	// 		index: 'username',
	// 		text: {
	// 			path: 'name',
	// 			query: msg.chat.username
	// 		}
	// 	}
	// }]).then(data => {
	// 	if (!data.length) {
	// 		User.create({ name: msg.chat.username })
	// 	}
	// });
}

async function handleCallback(query) {
	const session = getChatSession(query.from.id);

	if (!session) {
		createChatSession(query.from);
	}

	switch (query.data) {
		case "en":
			if (session.language !== "en") setChatSession(query.from.id, { language: "en" });
			await updateMsg(query.message, dictionary.greet.en, [
				// [{ text: dictionary.createGameSession.en, callback_data: "createGameSession" }]
			]);
			break;
		case "ua":
			if (session.language !== "ua") setChatSession(query.from.id, { language: "ua" });
			await updateMsg(query.message, dictionary.greet.ua, [
				// [{ text: dictionary.createGameSession.ua, callback_data: "createGameSession" }]
			]);
			break;
		case "createGameSession":
			createGameSession(query);
			break;
	}

	bot.answerCallbackQuery(query.id);
}

async function updateMsg(msg, text, keyboard) {
	await bot.editMessageText(text, {
		chat_id: msg.chat.id,
		message_id: msg.message_id,
		reply_markup: {
			inline_keyboard: keyboard
		}
	});
}

function createGameSession(query) {
	const chatId = query.message.chat.id;
	const messageId = query.message.message_id;
	const userId = query.from.id;

	bot.sendMessage(chatId, "user " + userId + " wants to create a game session");
}

module.exports = handleChat;