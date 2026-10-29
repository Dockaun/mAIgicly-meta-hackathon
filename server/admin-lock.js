'use strict';
// Admin lock for the public submission (hackathon step 14).
//
// /admin/*, /api/admin/* and the static public/admin pages require the
// shared admin token: header x-admin-token must equal env ADMIN_TOKEN.
// Missing or wrong token (including an unset ADMIN_TOKEN) returns 404 so
// admin routes stay undiscoverable. No dependencies; pure middleware.
function requireAdminToken(req, res, next) {
  const expected = process.env.ADMIN_TOKEN;
  const provided = req && req.headers ? req.headers['x-admin-token'] : undefined;
  if (!expected || provided !== expected) {
    if (res && typeof res.status === 'function') {
      return res.status(404).json({ error: 'Not found' });
    }
    return undefined;
  }
  if (typeof next === 'function') next();
  return undefined;
}

module.exports = { requireAdminToken };
