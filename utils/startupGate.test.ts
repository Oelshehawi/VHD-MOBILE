import { describe, expect, it } from '@jest/globals';

import { describeBlockingStage, shouldHideSplash, type StartupStage } from './startupGate';

const signedInAndReady: StartupStage = {
  fontsLoaded: true,
  authLoaded: true,
  isSignedIn: true,
  isDatabaseReady: true,
  isInitialScreenReady: true
};

describe('startup splash gate', () => {
  it('holds the splash until fonts and Clerk are ready', () => {
    expect(shouldHideSplash({ ...signedInAndReady, fontsLoaded: false })).toBe(false);
    expect(shouldHideSplash({ ...signedInAndReady, authLoaded: false })).toBe(false);
  });

  it('hides immediately for signed-out users, who read no local data', () => {
    expect(
      shouldHideSplash({
        fontsLoaded: true,
        authLoaded: true,
        isSignedIn: false,
        isDatabaseReady: false,
        isInitialScreenReady: false
      })
    ).toBe(true);
  });

  it('holds the splash for signed-in users until the local database is open', () => {
    expect(shouldHideSplash({ ...signedInAndReady, isDatabaseReady: false })).toBe(false);
  });

  it('holds the splash until the first screen reports its local queries settled', () => {
    expect(shouldHideSplash({ ...signedInAndReady, isInitialScreenReady: false })).toBe(false);
  });

  it('hides once the database is open and the first screen has data', () => {
    expect(shouldHideSplash(signedInAndReady)).toBe(true);
  });
});

describe('describeBlockingStage', () => {
  it('names the earliest unfinished stage', () => {
    expect(
      describeBlockingStage({ ...signedInAndReady, fontsLoaded: false, authLoaded: false })
    ).toBe('fonts');
    expect(describeBlockingStage({ ...signedInAndReady, authLoaded: false })).toBe('auth');
    expect(
      describeBlockingStage({
        ...signedInAndReady,
        isDatabaseReady: false,
        isInitialScreenReady: false
      })
    ).toBe('local-database');
    expect(describeBlockingStage({ ...signedInAndReady, isInitialScreenReady: false })).toBe(
      'initial-screen'
    );
  });

  it('reports no blocker once the gate is satisfied', () => {
    expect(describeBlockingStage(signedInAndReady)).toBe('none');
    expect(describeBlockingStage({ ...signedInAndReady, isSignedIn: false })).toBe('none');
  });
});
