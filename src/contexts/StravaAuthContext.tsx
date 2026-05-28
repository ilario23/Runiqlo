import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react';
import {
  StravaTokens,
  StravaAthlete,
  getStoredTokens,
  storeTokens,
  clearTokens,
  getAuthUrl,
  exchangeCodeForTokens,
} from '@/lib/strava';

interface StravaAuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  athlete: StravaAthlete | null;
  tokens: StravaTokens | null;
  login: () => void;
  logout: () => void;
  handleOAuthCallback: (code: string) => Promise<void>;
}

const StravaAuthContext = createContext<StravaAuthContextType | undefined>(
  undefined,
);

export const StravaAuthProvider = ({children}: {children: ReactNode}) => {
  const [tokens, setTokens] = useState<StravaTokens | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load stored tokens on mount (or auto-login in dev mode)
  useEffect(() => {
    const devId = process.env.NEXT_PUBLIC_DEV_ATHLETE_ID;
    if (devId) {
      setTokens({
        access_token: 'broker',
        refresh_token: 'broker',
        expires_at: 0,
        athlete: {id: Number(devId), username: 'dev', firstname: 'Dev', lastname: '', city: '', state: '', country: '', sex: '', profile_medium: '', profile: ''},
      });
    } else {
      const stored = getStoredTokens();
      if (stored) setTokens(stored);
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(() => {
    window.location.href = getAuthUrl();
  }, []);

  const logout = useCallback(() => {
    clearTokens();
    setTokens(null);
  }, []);

  const handleOAuthCallback = useCallback(async (code: string) => {
    setIsLoading(true);
    try {
      const newTokens = await exchangeCodeForTokens(code);
      setTokens(newTokens);
    } catch (error) {
      console.error('OAuth callback failed:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const isAuthenticated = !!tokens;
  const athlete = tokens?.athlete ?? null;

  return (
    <StravaAuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        athlete,
        tokens,
        login,
        logout,
        handleOAuthCallback,
      }}
    >
      {children}
    </StravaAuthContext.Provider>
  );
};

export const useStravaAuth = () => {
  const context = useContext(StravaAuthContext);
  if (!context) {
    throw new Error('useStravaAuth must be used within a StravaAuthProvider');
  }
  return context;
};
