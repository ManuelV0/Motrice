const express = require('express');
const auth = require('../middleware/auth');
const eventController = require('../controllers/eventController');

const router = express.Router();

router.get('/', eventController.listEvents);
router.get('/:id', eventController.getEventById);
router.post('/', auth, eventController.createEvent);
router.post('/:id/join', auth, eventController.joinEvent);
router.post('/:id/leave', auth, eventController.leaveEvent);
router.post('/:id/attendance', auth, eventController.confirmAttendance);
router.patch('/:id/status', auth, eventController.patchEventStatus);
router.delete('/:id', auth, eventController.deleteEvent);

module.exports = router;
