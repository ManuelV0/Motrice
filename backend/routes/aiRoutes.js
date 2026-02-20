const express = require('express');
const { aiController, aiToolsContextController } = require('../controllers/aiController');

const router = express.Router();

router.post('/', aiController);
router.get('/tools/context', aiToolsContextController);

module.exports = router;
