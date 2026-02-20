const express = require('express');
const auth = require('../middleware/auth');
const userController = require('../controllers/userController');

const router = express.Router();

router.get('/sports', userController.listSports);
router.get('/me', auth, userController.getMe);
router.put('/me', auth, userController.updateMe);

module.exports = router;
