type EnvMap = Record<string, string | undefined>;

function getBuildEnv() {
  return import.meta.env as EnvMap;
}

export function getServerEnv(name: string) {
  return process.env[name] ?? getBuildEnv()[name];
}

export function requireServerEnv(name: string) {
  const value = getServerEnv(name);

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}
