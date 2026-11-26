import React from 'react';
import './loadingDots.css';

export function LoadingDots({label = 'Loading', className = ''}) {
  return <span className={`loading-dots ${className}`} role="status" aria-label={label}>
    <span className="loading-dots-motion" aria-hidden="true"><i/><i/><i/></span>
  </span>;
}
