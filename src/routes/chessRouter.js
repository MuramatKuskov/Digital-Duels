const Router = require("express");
const router = new Router();
const chessController = require('../controllers/chessController');

router.get('/getPublicSessions', chessController.getPublicSessions);
router.get('/getSessionsByUser', chessController.getSessionsByUser);
router.get('/getSessionById', chessController.getSessionById);
// functions below is mostly done via websocket
router.get('/joinSession', chessController.joinSession);
router.post('/createSession', chessController.createSession);
router.patch('/updateSession', chessController.updateSession);
router.post('/exitSession', chessController.exitSession);


module.exports = router;