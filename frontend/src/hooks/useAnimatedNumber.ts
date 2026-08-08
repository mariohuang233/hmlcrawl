import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface UseAnimatedNumberOptions {
  duration?: number;
  easing?: 'easeOut' | 'easeInOut';
  delay?: number;
  precision?: number;
  autoStart?: boolean;
}

interface UseAnimatedNumberReturn {
  animatedValue: number;
  isAnimating: boolean;
  startAnimation: () => void;
}

function smartDuration(value: number): number {
  const absValue = Math.abs(value);
  if (absValue < 1) return 180;
  if (absValue < 10) return 220;
  return 280;
}

export const useAnimatedNumber = (
  targetValue: number,
  options: UseAnimatedNumberOptions = {}
): UseAnimatedNumberReturn => {
  const {
    duration,
    easing = 'easeOut',
    delay = 0,
    precision = 2,
    autoStart = true
  } = options;

  const [animatedValue, setAnimatedValue] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(
    () => typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const valueRef = useRef(0);
  const animationRef = useRef<number | null>(null);
  const delayRef = useRef<number | null>(null);

  const easingFunctions = useMemo(() => ({
    easeOut: (t: number) => 1 - Math.pow(1 - t, 3),
    easeInOut: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
  }), []);

  const cancelAnimation = useCallback(() => {
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (delayRef.current !== null) {
      window.clearTimeout(delayRef.current);
      delayRef.current = null;
    }
  }, []);

  const updateValue = useCallback((value: number) => {
    const rounded = Number(value.toFixed(precision));
    valueRef.current = rounded;
    setAnimatedValue(rounded);
  }, [precision]);

  const startAnimation = useCallback(() => {
    cancelAnimation();

    if (reduceMotion) {
      updateValue(targetValue);
      setIsAnimating(false);
      return;
    }

    const fromValue = valueRef.current;
    const distance = targetValue - fromValue;
    if (distance === 0) {
      setIsAnimating(false);
      return;
    }
    const animationDuration = Math.max(1, duration ?? smartDuration(distance));
    setIsAnimating(true);

    const begin = () => {
      delayRef.current = null;
      let startedAt: number | null = null;
      const animate = (timestamp: number) => {
        if (startedAt === null) startedAt = timestamp;
        const progress = Math.min((timestamp - startedAt) / animationDuration, 1);
        updateValue(fromValue + distance * easingFunctions[easing](progress));
        if (progress < 1) {
          animationRef.current = requestAnimationFrame(animate);
        } else {
          animationRef.current = null;
          updateValue(targetValue);
          setIsAnimating(false);
        }
      };
      animationRef.current = requestAnimationFrame(animate);
    };

    if (delay > 0) {
      delayRef.current = window.setTimeout(begin, delay);
    } else {
      begin();
    }
  }, [
    cancelAnimation,
    delay,
    duration,
    easing,
    easingFunctions,
    reduceMotion,
    targetValue,
    updateValue
  ]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduceMotion(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (autoStart) startAnimation();
    return cancelAnimation;
  }, [autoStart, cancelAnimation, startAnimation]);

  return { animatedValue, isAnimating, startAnimation };
};
