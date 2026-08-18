import React, { Suspense, useEffect, useRef, useState } from 'react';

interface DeferredSectionProps {
  children: React.ReactNode;
  label: string;
  minHeight?: number;
  rootMargin?: string;
  eager?: boolean;
}

const DeferredSection: React.FC<DeferredSectionProps> = ({
  children,
  label,
  minHeight = 380,
  rootMargin = '700px 0px',
  eager = false
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [shouldRender, setShouldRender] = useState(eager);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || shouldRender || eager) return;

    if (typeof IntersectionObserver === 'undefined') {
      setShouldRender(true);
      return;
    }

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setShouldRender(true);
        observer.disconnect();
      }
    }, { rootMargin, threshold: 0.01 });

    observer.observe(element);
    return () => observer.disconnect();
  }, [eager, rootMargin, shouldRender]);

  const fallback = (
    <div className="card deferred-card" style={{ minHeight }} aria-label={`${label}加载中`}>
      <div className="deferred-card-content">
        <div className="loading-spinner" aria-hidden="true"></div>
        <span>{label}</span>
      </div>
    </div>
  );

  return (
    <div
      ref={containerRef}
      className={`deferred-section ${shouldRender ? 'is-rendered' : 'is-pending'}`}
      style={shouldRender ? undefined : { minHeight }}
    >
      {shouldRender ? <Suspense fallback={fallback}>{children}</Suspense> : fallback}
    </div>
  );
};

export default React.memo(DeferredSection);
