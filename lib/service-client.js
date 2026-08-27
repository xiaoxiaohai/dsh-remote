function validateServiceUrl(raw, allowInsecureHTTP = false) {
  const url = new URL(raw);
  const local = ['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(allowInsecureHTTP && url.protocol === 'http:' && local)) {
    throw new Error('serviceUrl must use HTTPS');
  }
  if (url.username || url.password || (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
    throw new Error('serviceUrl must be an origin without credentials, path, query, or fragment');
  }
  return new URL(url.origin);
}

async function requestJson(url, options = {}, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error ?? `server returned HTTP ${response.status}`);
      error.statusCode = response.status;
      error.code = body.error;
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

function controlHeaders(installation) {
  return { authorization: `Bearer ${installation.controlSecret}` };
}

function macPath(installation) {
  return encodeURIComponent(installation.macId);
}

export function createServiceClient({ serviceUrl, allowInsecureHTTP = false, timeoutMs }) {
  const base = validateServiceUrl(serviceUrl, allowInsecureHTTP);
  return {
    register({ joinToken, displayName } = {}) {
      const body = {};
      if (joinToken) body.joinToken = joinToken;
      if (displayName) body.displayName = displayName;
      return requestJson(new URL('/v2/macs', base), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }, timeoutMs);
    },
    status(installation) {
      return requestJson(new URL(`/v2/macs/${macPath(installation)}`, base), {
        headers: controlHeaders(installation),
      }, timeoutMs);
    },
    createJoinToken(installation) {
      return requestJson(new URL(`/v2/macs/${macPath(installation)}/join-tokens`, base), {
        method: 'POST',
        headers: controlHeaders(installation),
      }, timeoutMs);
    },
    listAuthorizations(installation) {
      return requestJson(new URL(`/v2/macs/${macPath(installation)}/authorizations`, base), {
        headers: controlHeaders(installation),
      }, timeoutMs);
    },
    revokeAuthorization(installation, authorizationId) {
      return requestJson(new URL(`/v2/macs/${macPath(installation)}/authorizations/${encodeURIComponent(authorizationId)}`, base), {
        method: 'DELETE',
        headers: controlHeaders(installation),
      }, timeoutMs);
    },
    rotatePairing(installation) {
      return requestJson(new URL(`/v2/macs/${macPath(installation)}/pairing-token/rotate`, base), {
        method: 'POST',
        headers: controlHeaders(installation),
      }, timeoutMs);
    },
  };
}
