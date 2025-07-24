const { getPublicSessions, getSessionsByUser, getSession, createSession, joinSession, updateSession, deleteSession } = require('../sessions/ChessSession');
const { clients } = require('../wss.js');

class chessController {
	getPublicSessions(req, res) {
		try {
			const filter = req.query;
			const sessions = getPublicSessions();

			if (sessions.length > 0) {
				res.status(200).json({ message: 'Success', sessions });
			} else {
				res.status(204).json({ message: 'No public sessions found' });
			}
		} catch (error) {
			console.log(error);
			res.status(500).json({ error: error.message });
		}
	}

	getSessionById(req, res) {
		try {
			const { sessionId } = req.params;
			const session = getSession(sessionId);

			if (session) {
				res.status(200).json({ message: 'Success', session });
			} else {
				res.status(204).json({ message: 'Session not found' });
			}
		} catch (error) {
			console.log(error);
			res.status(500).json({ error: error.message });
		}
	}

	getSessionsByUser(req, res) {
		try {
			let { username, ignorePrivate } = req.query;
			// convert string to bool
			ignorePrivate = JSON.parse(ignorePrivate);
			const sessions = getSessionsByUser(username, ignorePrivate);

			if (sessions.length > 0) {
				res.status(200).json({ message: 'Success', sessions });
			} else {
				res.status(204).json({ message: 'No sessions found for this user' });
			}
		} catch (error) {
			console.log(error);
			res.status(500).json({ error: error.message });
		}
	}

	// functions below is mostly done via websocket
	// might be useful though
	exitSession(req, res) {
		try {
			const { sessionId, userId } = req.body;
			const session = getSession(sessionId);

			if (!session) {
				return res.status(404).json({ message: 'Session not found' });
			}

			if (session.player1.user.id !== userId && session.player2?.user?.id !== userId) {
				return res.status(403).json({ message: 'You are not a player in this session' });
			}

			const msg = JSON.stringify({
				type: "player left",
				data: {
					winner: userId === session.player1.user.id
						? session.player2.user.username
						: session.player1.user.username
				}
			});
			// notify connected clients
			session.player1.socketId && clients.get(session.player1.socketId)?.send(msg);
			session.player2.socketId && clients.get(session.player2.socketId)?.send(msg);
			session.spectators.forEach(clientId => {
				clients.get(clientId)?.send(msg);
			});

			deleteSession(sessionId);
			res.status(200).json({ message: 'Success' });
		} catch (error) {
			console.log(error);
			res.status(500).json({ error: error.message });
		}
	}

	createSession(req, res) {
		try {
			const data = req.body;

			// is args up to date here?
			const session = createSession(data.user, data.visibility);
			res.status(200).json({ message: 'Success', session });
		} catch (error) {
			console.log(error);
			res.status(500).json({ error: error.message });
		}
	}

	joinSession(req, res) {
		try {
			const { data } = req.body;
			// is args up to date here?
			const success = joinSession(data.sessionId, data.user);

			if (success) {
				res.status(200).json({ message: 'Success', session: success });
			} else {
				res.status(403).json({ message: 'Session is full' });
			}
		} catch (error) {
			console.log(error);
			res.status(500).json({ error: error.message });
		}
	}

	getSessionState(req, res) {
		try {
			const { sessionId, user } = req.body;
			const session = getSessionState(sessionId, user);

			if (!session) {
				return res.status(404).json({ message: 'Session not found' });
			} else {
				return res.status(200).json({ message: 'Success', session });
			}
		} catch (error) {
			console.log(error);
			res.status(500).json({ error: error.message });
		}
	}

	updateSession(req, res) {
		try {
			const data = req.body;

			const success = updateSession(data.sessionId, data.state);

			if (success) {
				res.status(200).json({ message: 'Success' });
			} else {
				res.status(500).json({ message: 'Fail' });
			}
		} catch (error) {
			console.log(error);
			res.status(500).json({ error: error.message });
		}
	}
}

module.exports = new chessController();