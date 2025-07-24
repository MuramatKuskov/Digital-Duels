const WebSocket = require("ws");
const { v4: uuidv4 } = require("uuid");
const { createSession, joinSession, restartGame, getSession, deleteSession } = require("./sessions/ChessSession.js");

const clients = new Map();

function initWSServer(server) {
	const wss = new WebSocket.Server({ server });

	wss.on("connection", (ws) => {
		const wsID = uuidv4();
		// associate player with session to notify
		// other clients in case of disconnection
		ws.currentSessionID = null;
		clients.set(wsID, ws);


		ws.on("error", (error) => {
			console.error(error);
		});

		ws.on("message", (message) => {
			message = JSON.parse(message);

			switch (message.type) {
				case "create session":
					message.data.host.socketId = wsID;
					const createdSession = createSession(message.data, notifyTimerExceeded, notifyStopinverseCountdown);

					ws.currentSessionID = createdSession.id;
					ws.send(JSON.stringify({
						type: "session created",
						data: createdSession
					}));
					break;

				case "join session":
					const { sessionID: id, user } = message.data;
					const { session: sessionToJoin, isNewPlayer } = joinSession(id, user, wsID, notifyTimerExceeded, notifyStopinverseCountdown);

					if (!sessionToJoin) {
						return ws.send(JSON.stringify({
							type: "error",
							data: { message: "Session not found" }
						}));
					}

					ws.currentSessionID = sessionToJoin.id;
					// message to client
					ws.send(JSON.stringify({
						type: "session joined",
						data: {
							...sessionToJoin,
							figures: Array.from(sessionToJoin.figures.entries()),
							socketId: wsID,
							inverseCountdown: sessionToJoin.inverseCountdown,
							isNewPlayer: isNewPlayer
						}
					}));

					// spectator joined -> return
					if (user.username !== sessionToJoin.player1.user.username
						&& user.username !== sessionToJoin.player2?.user?.username
					) {
						return;
					}

					// player joined -> notify other clients
					const joinedPlayer = user.username === sessionToJoin.player1.user.username
						? sessionToJoin.player1
						: sessionToJoin.player2;

					joinedPlayer.online = true;
					joinedPlayer.socketId = wsID;

					const msg = JSON.stringify({
						type: "player joined",
						data: {
							player: joinedPlayer,
							isStarted: sessionToJoin.isStarted,
							inverseCountdown: sessionToJoin.inverseCountdown
						},
					});
					// message to other clients
					user.username === sessionToJoin.player1.user.username
						? clients.get(sessionToJoin.player2.socketId)?.send(msg)
						: clients.get(sessionToJoin.player1.socketId)?.send(msg);

					sessionToJoin.spectators.forEach(clientId => {
						if (clients.has(clientId)) {
							clients.get(clientId).send(msg);
						}
					});

					break;

				case "move":
					const { sessionId, movedFigure, beatenFigure, playerId } = message.data;
					const session = getSession(sessionId);

					// check if session exists and player is allowed to move
					if (!session || playerId !== session.currentPlayer.user.id) return;

					// update figure
					let figureToMove = session.figures.get(movedFigure.id);
					figureToMove.position = movedFigure.position;
					figureToMove.rotation = movedFigure.rotation;
					figureToMove.isInitialPosition = movedFigure.isInitialPosition;
					figureToMove.isFirstStep = movedFigure.isFirstStep;
					if (beatenFigure) {
						session.figures.set(beatenFigure.id, beatenFigure);
					}

					// switch players
					session.currentPlayer = playerId === session.player1.user.id ? session.player2 : session.player1;
					// start on 1st move
					// session.isStarted = true;
					session.turn += 1;
					session.lastUpdate = Date.now();

					// send updated session to all clients
					const sessionUpdate = {
						type: "figure moved",
						data: {
							movedFigure,
							beatenFigure,
							playerOneTimeReserve: session.player1.timeReserve,
							playerTwoTimeReserve: session.player2.timeReserve,
						}
					}

					clients.get(session.currentPlayer.socketId)
						?.send(JSON.stringify(sessionUpdate));

					session.spectators.forEach(clientId => {
						if (clients.has(clientId)) {
							clients.get(clientId).send(JSON.stringify(sessionUpdate));
						}
					});
					break;

				case "leave session":
					const { sessionID, userId, socketId, keepAlive } = message.data;
					const sessionToUpdate = getSession(sessionID);

					if (!sessionToUpdate) return;

					// spectator disconnected
					if (
						socketId !== sessionToUpdate.player1.socketId
						&&
						socketId !== sessionToUpdate.player2.socketId
					) {
						const spectatorIndex = sessionToUpdate.spectators.indexOf(socketId);
						if (spectatorIndex !== -1) {
							sessionToUpdate.spectators.splice(spectatorIndex, 1);
						}
						return;
					}

					ws.currentSessionID = null;

					// player left — terminate session
					if (!keepAlive) {
						// notify other clients
						const winner = sessionToUpdate.player1.user.id === userId
							? sessionToUpdate.player2
							: sessionToUpdate.player1;

						const msg = JSON.stringify({
							type: "player left",
							data: {
								winner
							}
						})

						sessionToUpdate.player1.socketId && clients.get(sessionToUpdate.player1.socketId)?.send(msg);
						sessionToUpdate.player2.socketId && clients.get(sessionToUpdate.player2.socketId)?.send(msg);
						sessionToUpdate.spectators.forEach(clientId => {
							if (clients.has(clientId)) {
								clients.get(clientId).send(msg);
							}
						});

						// remove from server memory
						deleteSession(sessionID);
						return;
					}

					// player disconnected
					// keep session alive
					let disconnectedPlayer, remainingPlayer;
					if (socketId === sessionToUpdate.player1.socketId) {
						disconnectedPlayer = sessionToUpdate.player1;
						remainingPlayer = sessionToUpdate.player2;
					} else {
						disconnectedPlayer = sessionToUpdate.player2;
						remainingPlayer = sessionToUpdate.player1;
					}

					sessionToUpdate.spectators.push(disconnectedPlayer.socketId);
					sessionToUpdate.spectators.forEach(clientId => {
						if (clients.has(clientId)) {
							clients.get(clientId).send(JSON.stringify({
								type: "player disconnected",
								data: {
									disconnectedPlayerID: disconnectedPlayer.id
								}
							}));
						}
					});
					break;

				case "restart game":
					const { sessionId: restartSessionId, socketId: playerSocketId } = message.data;
					const restartedSession = restartGame(restartSessionId, playerSocketId);

					if (!restartedSession) return;

					// first of two votes
					if (restartedSession.votesForRestart === 1) {
						const recipientSocketId = playerSocketId === restartedSession.player1.socketId
							? restartedSession.player2.socketId
							: restartedSession.player1.socketId;

						if (clients.has(recipientSocketId)) {
							clients.get(recipientSocketId).send(JSON.stringify({
								type: "vote for restart"
							}));
						}
						restartedSession.spectators.forEach(clientId => {
							if (clients.has(clientId)) {
								clients.get(clientId).send(JSON.stringify({
									type: "vote for restart"
								}));
							}
						});

						return;
					}

					// notify clients about vote for restart
					if (clients.has(restartedSession.player1.socketId)) {
						clients.get(restartedSession.player1.socketId).send(JSON.stringify({
							type: "game restarted",
							data: {
								inverseCountdown: restartedSession.inverseCountdown
							}
						}));
					}
					if (clients.has(restartedSession.player2.socketId)) {
						clients.get(restartedSession.player2.socketId).send(JSON.stringify({
							type: "game restarted",
							data: {
								inverseCountdown: restartedSession.inverseCountdown
							}
						}));
					}
					restartedSession.spectators.forEach(clientId => {
						if (clients.has(clientId)) {
							clients.get(clientId).send(JSON.stringify({
								type: "game restarted",
								data: {
									inverseCountdown: restartedSession.inverseCountdown
								}
							}));
						}
					});
					break;

				case "game ended":
					const { sessionId: endSessionId } = message.data;
					const endedSession = getSession(endSessionId);
					if (!endedSession) return;

					endedSession.isStarted = false;
					endedSession.checked = true;
					break;
				default:
					throw new Error("Unknown message type: " + message.type);
			}
		});

		ws.on("close", (event) => {
			// notify other clients about player disconnection
			if (ws.currentSessionID) {
				const session = getSession(ws.currentSessionID);

				if (
					!session
					|| wsID !== session.player1.socketId
					|| wsID !== session.player2.socketId
				) return;

				const leaveMessage = JSON.stringify({
					type: "player disconnected",
					data: {
						disconnectedPlayerID: wsID,
					}
				});

				let remainingPlayer, leavedPlayer;
				if (wsID === session.player1.socketId) {
					remainingPlayer = session.player2;
					leavedPlayer = session.player1;
				} else {
					remainingPlayer = session.player1;
					leavedPlayer = session.player2;
				}

				leavedPlayer.online = false;
				leavedPlayer.socketId = null;

				if (clients.has(remainingPlayer.socketId)) {
					clients.get(remainingPlayer.socketId).send(leaveMessage);
				}
				session.spectators.forEach(clientId => {
					if (clients.has(clientId)) {
						clients.get(clientId).send(leaveMessage);
					}
				});

				session.lastUpdate = Date.now();
			}

			clients.delete(wsID);
			console.log(`Connection closed: ${wsID}`);
		});
	});
}

function notifyTimerExceeded(session) {
	const winner = session.player1.timeReserve <= 0
		? session.player2
		: session.player1;

	const msg = JSON.stringify({
		type: "timer exceeded",
		data: {
			winner
		}
	});

	clients.get(session.player1.socketId)?.send(msg);
	clients.get(session.player2.socketId)?.send(msg);
	session.spectators.forEach(clientId => {
		if (clients.has(clientId)) {
			clients.get(clientId).send(msg);
		}
	});
}

function notifyStopinverseCountdown(session) {
	const msg = JSON.stringify({
		type: "cancel inverse countdown",
		data: {
			inverseCountdown: session.inverseCountdown
		}
	});

	clients.get(session.player1.socketId)?.send(msg);
	clients.get(session.player2.socketId)?.send(msg);
	session.spectators.forEach(clientId => {
		if (clients.has(clientId)) {
			clients.get(clientId).send(msg);
		}
	});
}

module.exports = {
	initWSServer,
	clients
};