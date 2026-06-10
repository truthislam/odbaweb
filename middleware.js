export const config = {
  matcher: [
    '/ghost.html',
    '/ghost-v5.html',
    '/ghostext/:path*'
  ]
};

export default async function middleware(req) {
  const url = new URL(req.url);

  const cookieHeader = req.headers.get('cookie') || '';
  const match = cookieHeader.match(/ghost_access=([^;]+)/);
  
  if (!match) {
    url.pathname = '/ghost-unlock.html';
    return Response.redirect(url, 302);
  }

  const token = match[1];
  const parts = token.split('.');
  if (parts.length !== 2) {
    url.pathname = '/ghost-unlock.html';
    return Response.redirect(url, 302);
  }

  const [dataStr, sigStr] = parts;

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(process.env.SESSION_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    // Compute what the signature SHOULD be
    const computedSignatureBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(dataStr)
    );

    // Convert Buffer -> Base64 -> Base64URL
    const computedSignatureArray = Array.from(new Uint8Array(computedSignatureBuffer));
    const computedSignatureBase64 = btoa(String.fromCharCode.apply(null, computedSignatureArray));
    const computedSignatureBase64Url = computedSignatureBase64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    // Compare HMACs
    if (computedSignatureBase64Url !== sigStr) {
      console.warn('Invalid signature for ghost_access cookie');
      url.pathname = '/ghost-unlock.html';
      return Response.redirect(url, 302);
    }

    // Decode the base64url payload to check expiration
    let b64 = dataStr.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) {
      b64 += '=';
    }
    const payloadStr = atob(b64);
    const payload = JSON.parse(payloadStr);

    if (payload.exp && Date.now() > payload.exp) {
      console.warn('Session expired for ghost_access cookie');
      url.pathname = '/ghost-unlock.html';
      return Response.redirect(url, 302);
    }

    // If valid, explicitly allow the request to proceed
    return new Response(null, { headers: { 'x-middleware-next': '1' } });
    
  } catch (err) {
    console.error('Middleware verification error:', err);
    url.pathname = '/ghost-unlock.html';
    return Response.redirect(url, 302);
  }
}
