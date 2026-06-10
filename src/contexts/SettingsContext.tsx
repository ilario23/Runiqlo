'use client';

import {createContext, useContext, useState, useEffect, useRef, ReactNode} from 'react';
import {defaultSettings, type UserSettings} from '@/lib/activityModel';
import {useStravaAuth} from '@/contexts/StravaAuthContext';

interface SettingsContextType {
  settings: UserSettings;
  updateSettings: (patch: Partial<UserSettings>) => void;
  isLoading: boolean;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const SETTINGS_KEY = 'strava-coach-settings';

const readLocal = (): UserSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return {...defaultSettings, ...JSON.parse(raw)};
  } catch { /* ignore */ }
  return defaultSettings;
};

const writeLocal = (s: UserSettings) => {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* noop */ }
};

const rowToSettings = (row: Record<string, unknown>): UserSettings => ({
  ...defaultSettings,
  maxHr: (row.maxHr as number) ?? defaultSettings.maxHr,
  restingHr: (row.restingHr as number) ?? defaultSettings.restingHr,
  zones: (row.zones as UserSettings['zones']) ?? defaultSettings.zones,
  coachModel: (row.coachModel as string | null) ?? null,
});

export const SettingsProvider = ({children}: {children: ReactNode}) => {
  const {athlete} = useStravaAuth();
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const athleteIdRef = useRef<number | null>(null);

  // Hydrate from localStorage immediately to avoid flash of defaults
  useEffect(() => {
    setSettings(readLocal());
  }, []);

  // Load from DB when athlete is known
  useEffect(() => {
    if (!athlete?.id) {
      setIsLoading(false);
      return;
    }
    athleteIdRef.current = athlete.id;
    setIsLoading(true);
    const controller = new AbortController();
    fetch(`/api/db/user-settings?athleteId=${athlete.id}`, {signal: controller.signal})
      .then(r => r.ok ? r.json() : null)
      .then((row) => {
        if (!row) return;
        const merged = rowToSettings(row);
        setSettings(merged);
        writeLocal(merged);
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        /* keep current */
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [athlete?.id]);

  const updateSettings = (patch: Partial<UserSettings>) => {
    setSettings((prev) => {
      const next = {...prev, ...patch};
      writeLocal(next);
      const athleteId = athleteIdRef.current;
      if (athleteId) {
        fetch('/api/db/user-settings', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            athleteId,
            maxHr: next.maxHr,
            restingHr: next.restingHr,
            zones: next.zones,
            coachModel: next.coachModel ?? null,
            updatedAt: Date.now(),
          }),
        }).catch((err) => { console.error('Failed to persist settings', err); });
      }
      return next;
    });
  };

  return (
    <SettingsContext.Provider value={{settings, updateSettings, isLoading}}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
};
