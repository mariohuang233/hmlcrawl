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
  flashOnUpdate?: boolean;
}

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
  onAnimationComplete,
  flashOnUpdate = true
}) => {
  const { animatedValue, isAnimating } = useAnimatedNumber(value, {
    duration,
    easing,
    delay,
    precision,
    autoStart
  });
  
  const [prevValue, setPrevValue] = React.useState(value);
  const [isUpdating, setIsUpdating] = React.useState(false);

  React.useEffect(() => {
    if (!isAnimating && animatedValue === value && onAnimationComplete) {
      onAnimationComplete();
    }
  }, [isAnimating, animatedValue, value, onAnimationComplete]);

  React.useEffect(() => {
    if (flashOnUpdate && prevValue !== value && value !== 0) {
      setIsUpdating(true);
      const timer = setTimeout(() => {
        setIsUpdating(false);
        setPrevValue(value);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [value, prevValue, flashOnUpdate]);

  const formatValue = (val: number): string => {
    if (val === 0 && value !== 0) return '0.00';
    
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
      className={`animated-number ${className} ${isAnimating ? 'animating' : ''} ${isUpdating ? 'updating' : ''}`}
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
