import React, { useEffect, useState } from 'react';

const LazyImage: React.FC<{ src?: string; alt?: string; className?: string }> = ({ src, alt = '', className = '' }) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoaded(false);
    setError(false);
  }, [src]);

  if (!src) {
    return <div className={`w-10 h-10 rounded bg-slate-100 ${className}`} />;
  }

  return (
    <div className={`relative ${className}`}>
      {!loaded && !error && (
        <div className="absolute inset-0 bg-slate-100 rounded flex items-center justify-center">
          <svg className="w-6 h-6 text-slate-400 animate-spin" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
          </svg>
        </div>
      )}
      <img
        src={src}
        alt={alt}
        draggable={false}
        onContextMenu={(e) => e.preventDefault()}
        onDragStart={(e) => e.preventDefault()}
        style={{ WebkitUserDrag: 'none' as any, userSelect: 'none' }}
        className={`w-full h-full object-cover rounded ${loaded ? '' : 'hidden'}`}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
      {/* transparent overlay to prevent selection/copy/drag */}
      {!error && (
        <div
          className="absolute inset-0"
          onContextMenu={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onDragStart={(e) => e.preventDefault()}
          style={{ background: 'transparent', WebkitUserSelect: 'none', userSelect: 'none', pointerEvents: 'auto' }}
        />
      )}
      {error && (
        <div className="absolute inset-0 bg-slate-100 rounded flex items-center justify-center text-xs text-slate-500">✕</div>
      )}
    </div>
  );
};

export default LazyImage;
