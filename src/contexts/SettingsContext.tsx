'use client';

import {createContext, useContext, useState, useEffect, ReactNode} from 'react';
import {defaultSettings, type UserSettings} from '@/lib/activityModel';

interface SettingsContextType {
  settings: UserSettings;
  updateSettings: (patch: Partial<UserSettings>) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

const SETTINGS_KEY = 'strava-coach-settings';

export const SettingsProvider = ({children}: {children: ReactNode}) => {
  const [settings, setSettings] = useState<UserSettings>(defaultSettings);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) setSettings({...defaultSettings, ...JSON.parse(raw)});
    } catch { /* keep defaults */ }
  }, []);

  const updateSettings = (patch: Partial<UserSettings>) => {
    setSettings((prev) => {
      const next = {...prev, ...patch};
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  };

  return (
    <SettingsContext.Provider value={{settings, updateSettings}}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider');
  return ctx;
};
