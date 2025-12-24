import React, { useRef, useState, useCallback } from 'react';

interface Position {
  x: number;
  y: number;
}

interface SpotlightCardProps extends React.PropsWithChildren {
  className?: string;
  spotlightColor?: string;
}

const SpotlightCard: React.FC<SpotlightCardProps> = ({
  children,
  className = '',
  spotlightColor = 'rgba(139, 92, 246, 0.15)'
}) => {
  const divRef = useRef<HTMLDivElement>(null);
  const rectRef = useRef<DOMRect | null>(null);
  const rafRef = useRef<number | null>(null);
  const [isFocused, setIsFocused] = useState<boolean>(false);
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState<number>(0);

  // Cache rect and use requestAnimationFrame to batch updates
  const handleMouseMove: React.MouseEventHandler<HTMLDivElement> = useCallback((e) => {
    if (!divRef.current || isFocused) return;

    // Cancel any pending animation frame
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    // Use requestAnimationFrame to batch DOM reads/writes
    rafRef.current = requestAnimationFrame(() => {
      if (!divRef.current) return;
      
      // Cache rect if not available or if element might have moved
      if (!rectRef.current) {
        rectRef.current = divRef.current.getBoundingClientRect();
      }
      
      setPosition({ 
        x: e.clientX - rectRef.current.left, 
        y: e.clientY - rectRef.current.top 
      });
    });
  }, [isFocused]);

  const handleFocus = () => {
    setIsFocused(true);
    setOpacity(0.6);
  };

  const handleBlur = () => {
    setIsFocused(false);
    setOpacity(0);
  };

  const handleMouseEnter = useCallback(() => {
    // Reset rect cache on enter
    rectRef.current = null;
    setOpacity(0.6);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setOpacity(0);
    // Clear rect cache on leave
    rectRef.current = null;
  }, []);

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={`relative rounded-2xl border border-white/10 bg-white/95 backdrop-blur-md overflow-hidden ${className}`}
    >
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-500 ease-in-out"
        style={{
          opacity,
          background: `radial-gradient(circle at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 80%)`
        }}
      />
      {children}
    </div>
  );
};

export default SpotlightCard;
