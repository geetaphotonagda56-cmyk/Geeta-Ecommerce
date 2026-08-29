import express from 'express';
import { saveFCMToken, sendNotification } from '../controllers/fcmController';
import { authenticate, requireUserType } from '../../../middleware/auth';

const router = express.Router();

router.post('/save-token', authenticate, saveFCMToken);
router.post('/send', authenticate, requireUserType('Admin'), sendNotification);

export default router;
