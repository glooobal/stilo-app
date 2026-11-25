import Constants from 'expo-constants';

/** "1.0.0 (12)": the app version and, when set, the build number. */
export function getAppVersion(): string | null {
  const config = Constants.expoConfig;
  const version = config?.version ?? null;
  const build = config?.ios?.buildNumber ?? config?.android?.versionCode?.toString() ?? null;
  if (!version) return null;
  return build ? `${version} (${build})` : version;
}
