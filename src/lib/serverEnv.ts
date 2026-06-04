type RuntimeEnvMap = Record<string, unknown>;
type BuildEnvMap = Record<string, string | undefined>;

declare global {
  // Shared across the current worker instance so request middleware can expose runtime bindings.
  var __DNA_RUNTIME_ENV__: RuntimeEnvMap | undefined;
}

function getBuildEnv() {
  return import.meta.env as BuildEnvMap;
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
    nextEnv[key] = value;
  }

  globalThis.__DNA_RUNTIME_ENV__ = nextEnv;
}

export function syncRuntimeEnv(runtimeEnv: Record<string, unknown> | undefined) {
  if (!runtimeEnv) {
    return;
  }

  setRuntimeEnv(runtimeEnv);

  for (const [key, value] of Object.entries(runtimeEnv)) {
    if (typeof value === 'string' && process.env[key] !== value) {
      process.env[key] = value;
    }
  }
}

export function getServerEnv(name: string) {
  const runtimeValue = getRuntimeEnv()?.[name];
  return typeof runtimeValue === 'string' ? runtimeValue : process.env[name] ?? getBuildEnv()[name];
}

export function getServerBinding<T = unknown>(name: string): T | undefined {
  return getRuntimeEnv()?.[name] as T | undefined;
}

export function requireServerEnv(name: string) {
  const value = getServerEnv(name);

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}
