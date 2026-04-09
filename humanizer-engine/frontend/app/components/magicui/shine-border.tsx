import { type CSSProperties, type ReactNode } from 'react';

interface ShineBorderProps {
  borderRadius?: number;
  borderWidth?: number;
  duration?: number;
  color?: string | string[];
  className?: string;
  children: ReactNode;
}

export function ShineBorder({
  borderRadius = 14,
  borderWidth = 1.5,
  duration = 8,
  color = ['#4f46e5', '#10b981', '#6366f1'],
  className = '',
  children,
}: ShineBorderProps) {
  const colors = Array.isArray(color) ? color.join(', ') : color;
  return (
    <div
      style={{
        '--shine-border-radius': `${borderRadius}px`,
        '--shine-border-width': `${borderWidth}px`,
        '--shine-duration': `${duration}s`,
        '--shine-colors': colors,
        borderRadius: `${borderRadius}px`,
      } as CSSProperties}
      className={`shine-border ${className}`}
    >
      {children}
    </div>
  );
}
