import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface ImagePreviewProps {
  src: string;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
  previewSize?: number;
}

export function ImagePreview({
  src,
  alt,
  className,
  fallback,
  previewSize = 280,
}: ImagePreviewProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [imageError, setImageError] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = (e: React.MouseEvent) => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Use requestAnimationFrame to batch DOM reads
    requestAnimationFrame(() => {
      // Calculate position for the preview
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Position preview to the right of the image by default
      let x = rect.right + 12;
      let y = rect.top - 20;

      // If preview would go off right edge, show on left
      if (x + previewSize > viewportWidth - 20) {
        x = rect.left - previewSize - 12;
      }

      // If preview would go off bottom, adjust y
      if (y + previewSize > viewportHeight - 20) {
        y = viewportHeight - previewSize - 20;
      }

      // If preview would go off top, adjust y
      if (y < 20) {
        y = 20;
      }

      setPosition({ x, y });
      setIsHovered(true);
    });
  };

  const handleMouseLeave = () => {
    // Small delay before hiding to prevent flickering
    timeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 100);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  if (!src && fallback) {
    return <>{fallback}</>;
  }

  if (imageError && fallback) {
    return <>{fallback}</>;
  }

  const handleImageError = () => {
    setImageError(true);
  };

  return (
    <>
      <img
        ref={imageRef}
        src={src}
        alt={alt}
        className={cn(
          "cursor-pointer transition-all duration-200",
          isHovered && "ring-2 ring-primary ring-offset-2",
          className
        )}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onError={handleImageError}
      />

      {/* Preview Overlay */}
      {isHovered && !imageError && (
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{
            left: position.x,
            top: position.y,
          }}
        >
          <div
            className={cn(
              "bg-card rounded-xl shadow-2xl border border-border overflow-hidden",
              "animate-in zoom-in-75 fade-in-0 duration-200"
            )}
            style={{
              width: previewSize,
              height: previewSize,
            }}
          >
            <img
              src={src}
              alt={alt}
              className="w-full h-full object-cover"
              onError={handleImageError}
            />
            {/* Name overlay at bottom */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
              <p className="text-white text-sm font-medium truncate">{alt}</p>
            </div>
          </div>
          {/* Arrow pointer */}
          <div
            className="absolute w-3 h-3 bg-card border-l border-t border-border rotate-[-45deg]"
            style={{
              left: -6,
              top: 30,
            }}
          />
        </div>
      )}
    </>
  );
}

// Click-to-expand variant for mobile/touch devices
interface ImagePreviewModalProps {
  src: string;
  alt: string;
  className?: string;
  fallback?: React.ReactNode;
  children?: React.ReactNode;
}

export function ImagePreviewModal({
  src,
  alt,
  className,
  fallback,
  children,
}: ImagePreviewModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [imageError, setImageError] = useState(false);

  if (!src && fallback) {
    return <>{fallback}</>;
  }

  if (imageError && fallback) {
    return <>{fallback}</>;
  }

  const handleImageError = () => {
    setImageError(true);
  };

  return (
    <>
      <div
        onClick={() => setIsOpen(true)}
        className="cursor-pointer"
      >
        {children || (
          <img
            src={src}
            alt={alt}
            className={cn(
              "transition-transform duration-200 hover:scale-105",
              className
            )}
            onError={handleImageError}
          />
        )}
      </div>

      {/* Full screen modal */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-4 animate-in fade-in-0 duration-200"
          onClick={() => setIsOpen(false)}
        >
          <button
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-6 w-6 text-white" />
          </button>
          <div
            className="max-w-2xl max-h-[80vh] animate-in zoom-in-75 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={src}
              alt={alt}
              className="w-full h-full object-contain rounded-xl shadow-2xl"
              onError={handleImageError}
            />
            <p className="text-white text-center mt-4 text-lg font-medium">{alt}</p>
          </div>
        </div>
      )}
    </>
  );
}

