import React, {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { debugLogger } from '@/utils/DebugLogger';
import { describeBlockingStage, shouldHideSplash, type StartupStage } from '@/utils/startupGate';

/**
 * Upper bound on how long the splash may stay up. This is a ceiling, not a
 * delay: the splash hides the moment the gate is satisfied, which is normally
 * well under a second. The timer only matters if a stage wedges, in which case
 * we reveal the app rather than leaving it permanently covered.
 */
const SPLASH_FAILSAFE_MS = 5000;

const APP_START_MS = Date.now();

type StartupGateValue = {
  reportFontsLoaded: () => void;
  reportAuthStatus: (authLoaded: boolean, isSignedIn: boolean) => void;
  reportDatabaseReady: (isDatabaseReady: boolean) => void;
  reportInitialScreenReady: () => void;
};

const StartupGateContext = React.createContext<StartupGateValue | null>(null);

function useStartupGate(): StartupGateValue {
  const context = React.useContext(StartupGateContext);
  if (!context) {
    throw new Error('useStartupGate must be used within StartupGateProvider');
  }
  return context;
}

export const useStartupGateReporter = useStartupGate;

/**
 * Called by top-level screens once their initial set of local PowerSync queries
 * has returned at least one result. The gate latches on the first `true`, so a
 * later re-render (or a different screen) can never push the splash back up.
 */
export function useReportInitialScreenReady(isReady: boolean) {
  const { reportInitialScreenReady } = useStartupGate();

  useEffect(() => {
    if (isReady) {
      reportInitialScreenReady();
    }
  }, [isReady, reportInitialScreenReady]);
}

export const StartupGateProvider = ({ children }: { children: ReactNode }) => {
  const [stage, setStage] = useState<StartupStage>({
    fontsLoaded: false,
    authLoaded: false,
    isSignedIn: false,
    isDatabaseReady: false,
    isInitialScreenReady: false
  });

  // The effects below need the freshest stage without re-arming the fail-safe.
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const splashHiddenRef = useRef(false);
  const loggedStagesRef = useRef(new Set<string>());

  const hideSplash = useCallback((reason: 'ready' | 'failsafe') => {
    if (splashHiddenRef.current) {
      return;
    }
    splashHiddenRef.current = true;

    const elapsedMs = Date.now() - APP_START_MS;
    const payload = { reason, elapsedMs, stage: stageRef.current };

    if (reason === 'failsafe') {
      void debugLogger.warn('STARTUP', 'Splash fail-safe fired; revealing app anyway', {
        ...payload,
        blockedOn: describeBlockingStage(stageRef.current)
      });
    } else {
      void debugLogger.info('STARTUP', 'Splash hidden', payload);
    }

    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const logStageOnce = useCallback((name: string) => {
    if (loggedStagesRef.current.has(name)) {
      return;
    }
    loggedStagesRef.current.add(name);
    void debugLogger.info('STARTUP', `Startup stage reached: ${name}`, {
      elapsedMs: Date.now() - APP_START_MS
    });
  }, []);

  const reportFontsLoaded = useCallback(() => {
    setStage((previous) => (previous.fontsLoaded ? previous : { ...previous, fontsLoaded: true }));
  }, []);

  const reportAuthStatus = useCallback((authLoaded: boolean, isSignedIn: boolean) => {
    setStage((previous) =>
      previous.authLoaded === authLoaded && previous.isSignedIn === isSignedIn
        ? previous
        : { ...previous, authLoaded, isSignedIn }
    );
  }, []);

  const reportDatabaseReady = useCallback((isDatabaseReady: boolean) => {
    setStage((previous) =>
      previous.isDatabaseReady === isDatabaseReady ? previous : { ...previous, isDatabaseReady }
    );
  }, []);

  const reportInitialScreenReady = useCallback(() => {
    setStage((previous) =>
      previous.isInitialScreenReady ? previous : { ...previous, isInitialScreenReady: true }
    );
  }, []);

  useEffect(() => {
    if (stage.isDatabaseReady) {
      logStageOnce('local-database-ready');
    }
    if (stage.isInitialScreenReady) {
      logStageOnce('initial-screen-ready');
    }
  }, [stage.isDatabaseReady, stage.isInitialScreenReady, logStageOnce]);

  useEffect(() => {
    if (shouldHideSplash(stage)) {
      hideSplash('ready');
    }
  }, [stage, hideSplash]);

  useEffect(() => {
    const timer = setTimeout(() => hideSplash('failsafe'), SPLASH_FAILSAFE_MS);
    return () => clearTimeout(timer);
  }, [hideSplash]);

  const value = useMemo(
    () => ({
      reportFontsLoaded,
      reportAuthStatus,
      reportDatabaseReady,
      reportInitialScreenReady
    }),
    [reportFontsLoaded, reportAuthStatus, reportDatabaseReady, reportInitialScreenReady]
  );

  return <StartupGateContext.Provider value={value}>{children}</StartupGateContext.Provider>;
};
