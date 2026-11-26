import React, {useId, useLayoutEffect, useRef, useState} from 'react';

export function ArtistBiography({name, biography, sourceLabel="Artist information via your music server"}) {
  const id = useId();
  const textRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [measurement, setMeasurement] = useState({height: 0, overflows: false});

  useLayoutEffect(() => {
    setExpanded(false);
    const text = textRef.current;
    if (!text) return;
    const measure = () => {
      const lineHeight = parseFloat(window.getComputedStyle(text).lineHeight) || 24.75;
      const height = text.scrollHeight;
      const overflows = height > lineHeight * 5 + 1;
      setMeasurement(previous => previous.height === height && previous.overflows === overflows ? previous : {height, overflows});
    };
    measure();
    const observer = window.ResizeObserver ? new window.ResizeObserver(measure) : null;
    observer?.observe(text);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure); };
  }, [biography?.text]);

  if (!biography?.text) return null;
  return <section className="artist-biography" aria-label={`About ${name}`}>
    <div id={id} className={`artist-biography-preview${!expanded && measurement.overflows ? ' is-truncated' : ''}`}
      style={expanded ? {maxHeight: `${measurement.height}px`} : undefined}>
      <p ref={textRef}>{biography.text}</p>
    </div>
    {measurement.overflows && <button type="button" className="artist-biography-toggle" aria-expanded={expanded} aria-controls={id}
      onClick={() => setExpanded(value => !value)}>{expanded ? 'Less info' : 'More info'}</button>}
    <p className="artist-biography-source">{sourceLabel}{biography.sourceUrl && <> · <a href={biography.sourceUrl} target="_blank" rel="noopener noreferrer">Last.fm</a></>}</p>
  </section>;
}
