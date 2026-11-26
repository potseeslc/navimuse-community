import React from 'react';

export function LoadingSkeleton({label, layout = 'list', count = 6}) {
  return <div className={`loading-skeleton loading-skeleton-${layout}`} role="status" aria-label={label}>
    <span className="sr-only">{label}</span>
    <div className="loading-skeleton-items" aria-hidden="true">
      {Array.from({length:count},(_,index)=><div className="loading-skeleton-item" key={index}>
        <span className="loading-skeleton-art"/><span className="loading-skeleton-copy"><i/><i/></span>
      </div>)}
    </div>
  </div>;
}
