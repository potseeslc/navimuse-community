import React, {useRef, useState} from 'react';
import {Disc3} from 'lucide-react';

// Each image is keyed by its source. Late loads can never reveal another track's
// image, and the previous cover fades away even when the next image is slow.
export function TrackArtwork({src, alt = '', className = ''}) {
  const current = useRef(src);
  current.current = src;
  const [ready, setReady] = useState(null);
  const [snapshot, setSnapshot] = useState({src, previous: null});
  if (snapshot.src !== src) {
    setSnapshot({src, previous: ready === snapshot.src ? snapshot.src : null});
  }
  const previous = snapshot.src === src ? snapshot.previous : null;
  return <span className={`track-artwork ${className}`} role={alt ? 'img' : undefined} aria-label={alt || undefined} aria-hidden={alt ? undefined : true}>
    <span className="track-artwork-placeholder"><Disc3 size={32}/></span>
    {src && <img key={src} src={src} alt="" className={`track-artwork-current${ready === src ? ' is-ready' : ''}`}
      onLoad={() => {if (current.current === src) setReady(src);}}
      onError={() => {if (current.current === src) setReady(null);}}/>}
    {previous && previous !== src && <img key={`previous:${src}`} src={previous} alt="" className="track-artwork-previous"
      onAnimationEnd={() => setSnapshot(value => value.src === src ? {...value, previous:null} : value)}/>}
  </span>;
}
