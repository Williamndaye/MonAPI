const express = require('express');
const router = express.Router();
const { signupController } = require('../controllers/authController');

router.get('/test', (req, res) => {
  res.send('Route /auth/test OK');
});
// Route POST pour inscription
router.post('/signup', signupController);

module.exports = router;