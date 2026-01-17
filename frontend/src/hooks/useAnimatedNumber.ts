import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

interface UseAnimatedNumberOptions {
  duration?: number; // 动画持续时间（毫秒）
  easing?: 'easeOut' | 'easeInOut' | 'easeOutBounce' | 'easeOutElastic';
  delay?: number; // 延迟开始时间（毫秒）
  precision?: number; // 小数位数
  autoStart?: boolean; // 是否自动开始动画，默认为true
}

interface UseAnimatedNumberReturn {
  animatedValue: number;
  isAnimating: boolean;
  startAnimation: () => void;
}

/**
 * 数字动画Hook
 * 提供从0到目标值的平滑动画效果
 */
export const useAnimatedNumber = (
  targetValue: number,
  options: UseAnimatedNumberOptions = {}
): UseAnimatedNumberReturn => {
  const {
    easing = 'easeOutBounce',
    delay = 0,
    precision = 2,
    autoStart = true
  } = options;

  const [animatedValue, setAnimatedValue] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const animationRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const hasInitialized = useRef(false);

  // 缓动函数，使用useMemo缓存以避免依赖变化
  const easingFunctions = useMemo(() => ({
    easeOut: (t: number) => 1 - Math.pow(1 - t, 3),
    easeInOut: (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    easeOutBounce: (t: number) => {
      if (t < 1 / 2.75) {
        return 7.5625 * t * t;
      } else if (t < 2 / 2.75) {
        return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
      } else if (t < 2.5 / 2.75) {
        return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
      } else {
        return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
      }
    },
    easeOutElastic: (t: number) => {
      if (t === 0) return 0;
      if (t === 1) return 1;
      const c4 = (2 * Math.PI) / 3;
      return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    }
  }), []);

  // 根据数值大小智能调整动画持续时间
  const getSmartDuration = (value: number): number => {
    const absValue = Math.abs(value);
    
    // 小数值快速完成
    if (absValue < 1) return 800;
    // 中等数值
    if (absValue < 10) return 1200;
    // 大数值稍长但不过于拖沓
    if (absValue < 100) return 1800;
    // 超大数值
    return Math.min(2500, 1000 + absValue * 10);
  };

  const animate = useCallback((timestamp: number) => {
    if (!startTimeRef.current) {
      startTimeRef.current = timestamp;
    }

    const elapsed = timestamp - (startTimeRef.current || 0);
    const progress = Math.min(elapsed / getSmartDuration(targetValue), 1);
    
    // 应用缓动函数
    const easedProgress = easingFunctions[easing](progress);
    
    // 计算当前值
    const currentValue = targetValue * easedProgress;
    
    // 设置精度
    const roundedValue = Number(currentValue.toFixed(precision));
    setAnimatedValue(roundedValue);

    if (progress < 1) {
      animationRef.current = requestAnimationFrame(animate);
    } else {
      // 动画完成
      setAnimatedValue(Number(targetValue.toFixed(precision)));
      setIsAnimating(false);
    }
  }, [targetValue, easing, precision, easingFunctions]);

  const startAnimation = useCallback(() => {
    if (isAnimating) return;
    
    setIsAnimating(true);
    setAnimatedValue(0);
    
    if (delay > 0) {
      setTimeout(() => {
        startTimeRef.current = null;
        animationRef.current = requestAnimationFrame(animate);
      }, delay);
    } else {
      startTimeRef.current = null;
      animationRef.current = requestAnimationFrame(animate);
    }
  }, [isAnimating, delay, animate]);

  // 清理动画
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  // 当目标值改变时，重新开始动画
  useEffect(() => {
    if (targetValue !== 0 && !hasInitialized.current && autoStart) {
      hasInitialized.current = true;
      startAnimation();
    }
  }, [targetValue, startAnimation, autoStart]);

  return {
    animatedValue,
    isAnimating,
    startAnimation
  };
};
