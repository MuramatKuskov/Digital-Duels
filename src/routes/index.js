const Router = require("express");
const router = new Router();
const chessRouter = require('./chessRouter');

router.use('/chess', chessRouter);

module.exports = router;