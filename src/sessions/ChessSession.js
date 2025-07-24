const { v4: uuidv4 } = require('uuid');

const activeSessions = new Map();
// reference to the timer id
let serverTimer = null;
// update session timer each second
// or simply look for deprecated sessions sometimes
let timerFastMode = false;
// wait till start timer after both players connected
const inverseCountdown = 5;

function createSession({ host, visibility, timeCap, opponent, figures }, notifyTimerExceeded, notifyStopinverseCountdown) {
	host.online = true;

	const session = {
		id: uuidv4(),
		visibility: visibility,
		isStarted: false,
		timeCap: timeCap,
		inverseCountdown: timeCap ? inverseCountdown : 0,
		figures: new Map(figures),
		turn: 0,
		checked: false,
		player1: host,
		player2: opponent,
		currentPlayer: host,
		votesForRestart: 0,
		spectators: [],
		lastUpdate: Date.now(),
	};

	activeSessions.set(session.id, session);

	// init timer in "slow" mode (hourly clean-up)
	// shift into "fast" mode on both player connect (in joinSession())
	if (!serverTimer) {
		serverTimer = setInterval(() => timerCallback(notifyTimerExceeded, notifyStopinverseCountdown), 1000 * 60 * 60);
	}

	return session;
}

// watch for deprecated sessions by timestamp
// & handle session timer
function timerCallback(notifyTimerExceeded, notifyStopinverseCountdown) {
	activeSessions.forEach((session, id) => {
		// if session is not updated for more than 24 hours, delete it
		if (Date.now() - session.lastUpdate > 1000 * 60 * 60 * 24) {
			activeSessions.delete(id);
			return;
		}

		// is session timer should be updated
		const isSessionTimerActive = session.timeCap && session.isStarted;
		if (!isSessionTimerActive) return;

		// stop inverse countdown if player disconnected
		const bothPlayersOnline = session.player1.online && session.player2.online;
		if (
			session.inverseCountdown > 0
			&& !bothPlayersOnline
		) {
			session.isStarted = false;
			session.inverseCountdown = inverseCountdown;
			notifyStopinverseCountdown(session);
		} else if (session.inverseCountdown > 0) {
			// decrease inverse countdown first
			session.inverseCountdown -= 1;
			return;
		}

		session.currentPlayer.timeReserve -= 1;
		// console.log("TimerCb: ", session.player1.timeReserve, session.player2.timeReserve);

		if (session.currentPlayer.timeReserve <= 0) {
			// end session
			session.isStarted = false;
			notifyTimerExceeded(session);
		}
	});
}

function joinSession(id, user, socketId, notifyTimerExceeded, notifyStopinverseCountdown) {
	const session = activeSessions.get(id);

	if (!session) return { session: null };

	let isNewPlayer = false;

	if (user.username === session.player1.user.username) {
		// host
		session.player1.online = true;
	} else if (
		// invited or previously joined opponent
		user.username === session.player2?.user?.username
		||
		// no opponent yet
		!session.player2.user
	) {
		if (!session.player2.user) isNewPlayer = true;
		session.player2.user = user;
		session.player2.socketId = socketId;
		session.player2.online = true;
	} else {
		// both opponents exist, join as spectator
		session.spectators.push(socketId);
	}

	if (session.player1.online && session.player2.online) {
		if (!timerFastMode && session.timeCap) {
			// shift server timer into "fast" mode
			timerFastMode = true;
			clearInterval(serverTimer);
			serverTimer = setInterval(() => timerCallback(notifyTimerExceeded, notifyStopinverseCountdown), 1000);
		}

		// prevent start if current game over
		if (session.turn === 0) session.isStarted = true;
		session.lastUpdate = Date.now();
	}

	session.lastUpdate = Date.now();

	return { session, isNewPlayer };
}

function restartGame(id, userSocketId) {
	const session = activeSessions.get(id);

	if (!session) {
		return null;
	}

	if (
		userSocketId !== session.player1.socketId
		&& userSocketId !== session.player2.socketId
	) {
		return null;
	}

	session.votesForRestart += 1;

	if (session.votesForRestart >= 2) {
		session.figures.forEach((figure, key) => {
			// reset figures to initial positions
			figure.position = { x: figure.initialPosition.x, y: figure.initialPosition.y, z: figure.initialPosition.z };
			figure.rotation = figure.initialPosition.rotation;
			figure.isInitialPosition = true;
			if (figure.hasOwnProperty("isFirstStep")) {
				figure.isFirstStep = true;
				console.log("FirstStep reset for: " + figure.name);
			}
			figure.defeated = false;
			session.figures.set(key, figure);
		});

		session.turn = 0;
		session.checked = false;
		session.currentPlayer = session.player1;
		session.votesForRestart = 0;
		session.inverseCountdown = session.timeCap ? inverseCountdown : 0;
		session.isStarted = true;
		session.player1.timeReserve = session.timeCap;
		session.player2.timeReserve = session.timeCap;
		session.lastUpdate = Date.now();
	}

	return session;
}

function getSessionState(id, user) {
	const session = activeSessions.get(id);
}

function getSession(id) {
	return activeSessions.get(id);
}

function getPublicSessions() {
	return Array.from(activeSessions.values())
		.filter(session => session.visibility === true);
}

function getSessionsByUser(username, ignorePrivate = true) {
	return Array.from(activeSessions.values())
		.filter(session => (
			(session.player1.user.username === username || session.player2.user?.username === username)
			&& (!ignorePrivate || session.visibility === true)
		));
}

function updateSession(id, data) {

}

function deleteSession(id) {
	if (activeSessions.has(id)) {
		activeSessions.delete(id);
	}

	// stop server timer if no active sessions left
	if (activeSessions.size === 0) {
		clearInterval(serverTimer);
		serverTimer = null;
		timerFastMode = false;
		return;
	}

	// shift server timer into "slow" mode (hourly clean-up)
	// if no sessions with time cap left
	let timerUpdateReset = true;
	activeSessions.forEach((session, key) => {
		if (session.timeCap) {
			timerUpdateReset = false;
		}
	});
	if (timerUpdateReset) {
		clearInterval(serverTimer);
		serverTimer = setInterval(() => timerCallback(), 1000 * 60 * 60);
		timerFastMode = false;
	}
}

module.exports = {
	createSession,
	joinSession,
	restartGame,
	getSession,
	getPublicSessions,
	getSessionsByUser,
	updateSession,
	deleteSession
};