import React, { createContext, useContext, useMemo, useState } from 'react';

type RtcSessionState = {
  token: string;
  identity: string;
  channel: string;
};

type RtcSessionContextValue = {
  session: RtcSessionState | null;
  setSession: (session: RtcSessionState | null) => void;
};

const RtcSessionContext = createContext<RtcSessionContextValue | null>(null);

export function RtcSessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<RtcSessionState | null>(null);
  const value = useMemo(() => ({ session, setSession }), [session]);
  return (
    <RtcSessionContext.Provider value={value}>
      {children}
    </RtcSessionContext.Provider>
  );
}

export function useRtcSession() {
  const ctx = useContext(RtcSessionContext);
  if (!ctx) {
    throw new Error('useRtcSession must be used within RtcSessionProvider');
  }
  return ctx;
}
