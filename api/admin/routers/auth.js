const { Router } = require('express');
const config = require('../../../config');
const passport = require('../passport');

const onSuccess = (req, res) => {
  const script = `
    <script nonce="${res.locals.cspNonce}">
      window.opener.postMessage("success", "*")
    </script>
  `;

  res.send(script);
};

const router = Router();

// Until Pages SCR
const authProvider = config.app.product === 'federalist' ? 'github' : 'uaa';
router.get('/login', passport.authenticate(authProvider));
router.get('/auth/github2/callback', passport.authenticate('github'), onSuccess);
//

// router.get('/login', passport.authenticate('uaa'));
router.get('/logout', passport.logout);

// Callbacks need to be registered with CF UAA service
router.get('/auth/uaa/callback', passport.authenticate('uaa'), onSuccess);
router.get('/auth/uaa/logout', onSuccess);

module.exports = router;
