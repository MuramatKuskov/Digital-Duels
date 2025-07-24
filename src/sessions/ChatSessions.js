const chatSessions = new Map();

function createChatSession(user) {
	const session = {
		username: user.username,
		language: 'en',
		isPromptedForFeedback: false,
		unexpectedMessagesInARow: 0,
	};

	chatSessions.set(user.id, session);

	return session;
}

function getChatSession(userId) {
	return chatSessions.get(userId);
}

function deleteChatSession(userId) {
	return chatSessions.delete(userId);
}

function setChatSession(userId, data) {
	const session = chatSessions.get(userId);
	chatSessions.set(userId, { ...session, ...data });
}

module.exports = {
	createChatSession,
	getChatSession,
	deleteChatSession,
	setChatSession,
};