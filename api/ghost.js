// /api/ghost
// The ONLY way to load the app. Reads the signed cookie, verifies the HMAC,
// checks expiry, and only then streams ghost-v5.html. No valid cookie -> bounce
// to the unlock page. Because the file is served by this function (not sitting
// in /public as a static asset), it can never be fetched without a valid cookie.

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

function verify(token) {
  if (!token) return null;
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;
  const expected = crypto
    .createHmac('sha256', process.env.SESSION_SECRET)
    .update(data)
    .digest('base64url');
  // Constant-time compare to avoid timing leaks.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString());
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

export default function handler(req, res) {
  const payload = verify(readCookie(req, 'ghost_access'));
  if (!payload) {
    res.writeHead(302, { Location: '/ghost-unlock.html' });
    return res.end();
  }

  // ghost-v5.html is kept OUT of /public so it is never publicly downloadable.
  // It sits next to the project root; adjust the path if you move it.
  const file = path.join(process.cwd(), 'private', 'ghost-v5.html');
  const html = fs.readFileSync(file, 'utf8');

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(html);
}
