/**
 * Decides when the native splash screen may be hidden on app launch.
 *
 * PowerSync opens `powersync.db` asynchronously and each `useQuery` returns an
 * empty array until its first local read lands. Hiding the splash before that
 * happens makes the first painted frame a false "no data" state. For a signed-in
 * user we therefore hold the splash until the local database is open *and* the
 * first screen has reported that its critical local queries settled once.
 *
 * Nothing here waits on the network: the sync connection is a separate phase
 * (`System.startOnlineServices`) and cached data must render while offline.
 */
export type StartupStage = {
  /** Custom fonts finished loading (or failed) — required before drawing text. */
  fontsLoaded: boolean;
  /** Clerk has restored its cached session, so `isSignedIn` is meaningful. */
  authLoaded: boolean;
  isSignedIn: boolean;
  /** The local PowerSync SQLite database is open and the schema is applied. */
  isDatabaseReady: boolean;
  /** The first top-level screen reported its initial local query set as settled. */
  isInitialScreenReady: boolean;
};

export function shouldHideSplash(stage: StartupStage): boolean {
  if (!stage.fontsLoaded || !stage.authLoaded) {
    return false;
  }

  // The sign-in screen reads no local data, so there is nothing to wait for.
  if (!stage.isSignedIn) {
    return true;
  }

  return stage.isDatabaseReady && stage.isInitialScreenReady;
}

/**
 * Names the earliest stage still blocking the splash. Used by the fail-safe log
 * so a wedged launch points at the stage that never completed.
 */
export function describeBlockingStage(stage: StartupStage): string {
  if (!stage.fontsLoaded) return 'fonts';
  if (!stage.authLoaded) return 'auth';
  if (!stage.isSignedIn) return 'none';
  if (!stage.isDatabaseReady) return 'local-database';
  if (!stage.isInitialScreenReady) return 'initial-screen';
  return 'none';
}
