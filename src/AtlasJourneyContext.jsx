import { createContext, useContext } from 'react';

export const AtlasJourneyContext = createContext(null);
export function useAtlasJourney() { const value=useContext(AtlasJourneyContext); if(!value)throw new Error('AtlasJourneyContext is unavailable'); return value; }
