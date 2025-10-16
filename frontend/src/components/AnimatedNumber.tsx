import React from 'react';
import { useAnimatedNumber } from '../hooks/useAnimatedNumber';

interface AnimatedNumberProps {
  value: number;
  unit?: string;
  prefix?: string;
  suffix?: string;
  precision?: number;
  duration?: number;
  easing?: 'easeOut' | 'easeInOut' | 'easeOutBounce' | 'easeOutElastic';
  delay?: number;
  autoStart?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onAnimationComplete?: () => void;
}

/**
 * 带动画效果的数字组件
 * 支持从0到目标值的平滑动画
 */
const AnimatedNumber: React.FC<AnimatedNumberProps> = ({
  value,
  unit = '',
  prefix = '',
  suffix = '',
  precision = 2,
  duration = 2000,
  easing = 'easeOutBounce',
  delay = 0,
  autoStart = true,
  className = '',
  style = {},
  onAnimationComplete
}) => {
  const { animatedValue, isAnimating } = useAnimatedNumber(value, {
    duration,
    easing,
    delay,
    precision,
    autoStart
  });

  // 监听动画完成
  React.useEffect(() => {
    if (!isAnimating && animatedValue === value && onAnimationComplete) {
      onAnimationComplete();
    }
  }, [isAnimating, animatedValue, value, onAnimationComplete]);

  // 格式化显示值
  const formatValue = (val: number): string => {
    if (val === 0 && value !== 0) return '0.00'; // 动画开始时的显示
    
    // 根据数值大小决定显示格式
    if (Math.abs(val) >= 1000) {
      return val.toLocaleString('zh-CN', { 
        minimumFractionDigits: precision,
        maximumFractionDigits: precision 
      });
    }
    
    return val.toFixed(precision);
  };

  const displayValue = formatValue(animatedValue);
  const fullValue = `${prefix}${displayValue}${suffix}`;

  return (
    <span 
      className={`animated-number ${className} ${isAnimating ? 'animating' : ''}`}
      style={{
        display: 'inline-block',
        transition: 'transform 0.2s ease-out',
        transform: isAnimating ? 'scale(1.02)' : 'scale(1)',
        ...style
      }}
    >
      {fullValue}
    </span>
  );
};

export default AnimatedNumber;
