import React from 'react';
import { RadioTower } from 'lucide-react';

// The same tower as the app icon, with quiet broadcast rings behind it.
export function TowerArtwork() {
  return <div className="onboarding-art" aria-hidden="true">
    <div className="onboarding-rings"><i/><i/><i/></div>
    <RadioTower className="onboarding-tower" size={120} strokeWidth={1.2}/>
    <span className="onboarding-art-caption">Your music. Your signal.</span>
  </div>;
}
