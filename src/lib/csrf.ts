function normalizeDevHost(hostname: string) {
  if (hostname === '127.0.0.1' || hostname === '::1') {
    return 'localhost';
  }

  return hostname;
}

export function hasValidOrigin(request: Request) {
  const originHeader = request.headers.get('origin') ?? request.headers.get('referer');

  if (!originHeader) {
    return false;
  }

  try {
    const originUrl = new URL(originHeader);
    const requestUrl = new URL(request.url);
    const configuredSite = import.meta.env.SITE;
    const allowedUrl = configuredSite ? new URL(configuredSite) : requestUrl;

    const sameProtocol = originUrl.protocol === allowedUrl.protocol;
    const samePort = originUrl.port === allowedUrl.port;
    const sameHost = normalizeDevHost(originUrl.hostname) === normalizeDevHost(allowedUrl.hostname);

    return sameProtocol && samePort && sameHost;
  } catch {
    return false;
  }
}
