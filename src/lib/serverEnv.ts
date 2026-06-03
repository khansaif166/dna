type EnvMap = Record<string, string | undefined>;

declare global {
  // Shared across the current worker instance so request middleware can expose runtime bindings.
  var __DNA_RUNTIME_ENV__: EnvMap | undefined;
}

function getBuildEnv() {
  return import.meta.env as EnvMap;
}

function getRuntimeEnv() {
  return globalThis.__DNA_RUNTIME_ENV__;
}

export function setRuntimeEnv(runtimeEnv: Record<string, unknown> | undefined) {
  if (!runtimeEnv) {
    return;
  }

  const nextEnv = { ...(getRuntimeEnv() ?? {}) };

  for (const [key, value] of Object.entries(runtimeEnv)) {
    if (typeof value === 'string') {
      nextEnv[key] = value;
    }
  }

  globalThis.__DNA_RUNTIME_ENV__ = nextEnv;
}

export function getServerEnv(name: string) {
  return getRuntimeEnv()?.[name] ?? process.env[name] ?? getBuildEnv()[name];
}

export function requireServerEnv(name: string) {
  const value = getServerEnv(name);

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}
