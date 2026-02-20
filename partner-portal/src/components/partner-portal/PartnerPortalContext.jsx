import { createContext, useContext } from 'react';

const PartnerPortalContext = createContext(null);

export function PartnerPortalProvider({ value, children }) {
  return <PartnerPortalContext.Provider value={value}>{children}</PartnerPortalContext.Provider>;
}

export function usePartnerPortal() {
  const ctx = useContext(PartnerPortalContext);
  if (!ctx) throw new Error('usePartnerPortal must be used within PartnerPortalProvider');
  return ctx;
}
