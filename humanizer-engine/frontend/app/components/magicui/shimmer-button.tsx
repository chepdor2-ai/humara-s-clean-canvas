'use client';
import { type ComponentPropsWithoutRef, type CSSProperties, type FC, type ReactNode } from 'react';

interface ShimmerButtonProps extends ComponentPropsWithoutRef<'button'> {
  shimmerColor?: string;
  shimmerSize?: string;
  background?: string;
  children?: ReactNode;
}

export const ShimmerButton: FC<ShimmerButtonProps> = ({
  shimmerColor = 'rgba(255,255,255,0.3)',
  shimmerSize = '0.1em',
  background = 'linear-gradient(135deg, #4f46e5, #6366f1, #4338ca)',
  children,
  className = '',
  ...props
}) => {
  return (
    <button
      style={{
        '--shimmer-color': shimmerColor,
        '--shimmer-size': shimmerSize,
        '--shimmer-bg': background,
      } as CSSProperties}
      className={`shimmer-btn ${className}`}
      {...props}
    >
      <span className="shimmer-btn__spark" />
      <span className="relative z-10 flex items-center justify-center gap-2">{children}</span>
    </button>
  );
};
