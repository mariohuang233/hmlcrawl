import React, { Suspense, useEffect, useRef, useState } from 'react';

interface DeferredSectionProps {
  children: React.ReactNode;
  label: string;
  minHeight?: number;
  rootMargin?: string;
}

const DeferredSection: React.FC<DeferredSectionProps> = ({
  children,
  label,
  minHeight = 380,
  rootMargin = '350px 0px'
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    const element = containerRef.current;
    if (!element || shouldRender) return;

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
  }, [rootMargin, shouldRender]);

  const fallback = (
    <div className="card deferred-card" style={{ minHeight }} aria-label={`${label}加载中`}>
      <div className="deferred-card-content">
        <div className="loading-spinner" aria-hidden="true"></div>
        <span>{label}</span>
      </div>
    </div>
  );

  return (
    <div ref={containerRef} className="deferred-section" style={{ minHeight }}>
      {shouldRender ? <Suspense fallback={fallback}>{children}</Suspense> : fallback}
    </div>
  );
};

export default React.memo(DeferredSection);
