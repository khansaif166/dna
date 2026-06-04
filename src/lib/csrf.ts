import { getServerEnv } from './serverEnv';

function normalizeDevHost(hostname: string) {
  if (hostname === '127.0.0.1' || hostname === '::1') {
    return 'localhost';
  }

  return hostname;
}

function expandAllowedHosts(hostname: string) {
  const normalized = normalizeDevHost(hostname);
  const hosts = new Set([normalized]);

  if (normalized.startsWith('www.')) {
    hosts.add(normalized.slice(4));
  } else {
    hosts.add(`www.${normalized}`);
  }

  return hosts;
}

export function hasValidOrigin(request: Request) {
  const originHeader = request.headers.get('origin') ?? request.headers.get('referer');
  const requestUrl = new URL(request.url);
  const configuredSite = getServerEnv('SITE');
  const configuredUrl = configuredSite ? new URL(configuredSite) : null;
  const allowedHosts = new Set([
    ...expandAllowedHosts(requestUrl.hostname),
    ...(configuredUrl ? [...expandAllowedHosts(configuredUrl.hostname)] : []),
  ]);

  if (!originHeader) {
    const fetchSite = request.headers.get('sec-fetch-site');
    return fetchSite === 'same-origin' || fetchSite === 'same-site';
  }

  try {
    const originUrl = new URL(originHeader);
    const sameProtocol =
      originUrl.protocol === requestUrl.protocol ||
      (configuredUrl ? originUrl.protocol === configuredUrl.protocol : false);
    const samePort =
      originUrl.port === requestUrl.port ||
      (configuredUrl ? originUrl.port === configuredUrl.port : false);
    const sameHost = allowedHosts.has(normalizeDevHost(originUrl.hostname));

    return sameProtocol && samePort && sameHost;
  } catch {
    return false;
  }
}
