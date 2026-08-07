import React from 'react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ size = 'md', showText = true, className = '' }) => {
  const iconSizes = {
    sm: 'w-9 h-9',
    md: 'w-11 h-11',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24'
  };

  const textSizes = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-3xl',
    xl: 'text-4xl'
  };

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Squircle Card icon matching Image 4 */}
      <div className={`${iconSizes[size]} relative flex items-center justify-center rounded-[22px] bg-gradient-to-b from-white to-slate-50 dark:from-slate-800 dark:to-slate-900 border-2 border-teal-400/80 shadow-lg shadow-teal-500/20 p-2 shrink-0 overflow-hidden`}>
        {/* Subtle background glow */}
        <div className="absolute inset-0 bg-teal-400/10 rounded-[20px]" />
        
        {/* SVG Teal Heart with ECG pulse line inside - exactly matching Image 4 */}
        <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full relative z-10">
          {/* Heart shape */}
          <path 
            d="M50 85C50 85 84 66 84 43C84 30.5 74 20 61.5 20C54.2 20 47.7 23.5 43.8 29.5C43 30.7 41.2 30.7 40.4 29.5C36.5 23.5 30 20 22.7 20C10.2 20 0.2 30.5 0.2 43C0.2 66 50 85 50 85Z" 
            className="fill-teal-400 dark:fill-teal-400" 
          />
          {/* ECG / Heartbeat pulse line cut-out through heart */}
          <path 
            d="M12 47H32L38 36L46 59L54 26L61 51L67 47H86" 
            stroke="white" 
            strokeWidth="5" 
            strokeLinecap="round" 
            strokeLinejoin="round" 
          />
        </svg>
      </div>
      
      {showText && (
        <span className={`font-black tracking-tight text-slate-800 dark:text-white ${textSizes[size]}`}>
          داروتو
        </span>
      )}
    </div>
  );
};

