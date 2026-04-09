import { type ComponentPropsWithoutRef, type CSSProperties, type FC } from 'react';

export const AnimatedShinyText: FC<ComponentPropsWithoutRef<'span'> & { shimmerWidth?: number }> = ({
  children,
  className = '',
  shimmerWidth = 100,
  ...props
}) => {
  return (
    <span
      style={{ '--shiny-width': `${shimmerWidth}px` } as CSSProperties}
      className={`shiny-text ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};
