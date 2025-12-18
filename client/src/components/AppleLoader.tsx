import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";

interface AppleLoaderProps {
  text: string;
  isLoading: boolean;
  onComplete?: () => void;
  minDuration?: number;
}

export function AppleLoader({ text, isLoading, onComplete, minDuration = 1500 }: AppleLoaderProps) {
  const [showLoader, setShowLoader] = useState(true);
  const [hasMinDurationPassed, setHasMinDurationPassed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setHasMinDurationPassed(true);
    }, minDuration);

    return () => clearTimeout(timer);
  }, [minDuration]);

  useEffect(() => {
    if (!isLoading && hasMinDurationPassed) {
      const fadeTimer = setTimeout(() => {
        setShowLoader(false);
        onComplete?.();
      }, 500);
      return () => clearTimeout(fadeTimer);
    }
  }, [isLoading, hasMinDurationPassed, onComplete]);

  const letters = text.split("");

  return (
    <AnimatePresence>
      {showLoader && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-parchment via-white to-silver/30"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8, ease: "easeInOut" }}
        >
          <div className="flex items-center justify-center">
            <motion.div 
              className="flex"
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              {letters.map((letter, index) => (
                <motion.span
                  key={index}
                  className="text-6xl md:text-8xl font-light tracking-tight"
                  style={{
                    background: "linear-gradient(135deg, #463f3a 0%, #8a817c 50%, #463f3a 100%)",
                    backgroundSize: "200% 200%",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                  initial={{ 
                    opacity: 0, 
                    y: 20,
                    filter: "blur(10px)"
                  }}
                  animate={{ 
                    opacity: 1, 
                    y: 0,
                    filter: "blur(0px)",
                    backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"]
                  }}
                  transition={{
                    opacity: { duration: 0.5, delay: index * 0.08 },
                    y: { duration: 0.5, delay: index * 0.08, ease: "easeOut" },
                    filter: { duration: 0.5, delay: index * 0.08 },
                    backgroundPosition: { 
                      duration: 3, 
                      repeat: Infinity, 
                      ease: "linear",
                      delay: index * 0.1
                    }
                  }}
                >
                  {letter}
                </motion.span>
              ))}
            </motion.div>
          </div>
          
          <motion.div
            className="absolute bottom-20 left-1/2 -translate-x-1/2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.5 }}
          >
            <div className="flex space-x-1">
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-2 h-2 rounded-full bg-grey_olive/50"
                  animate={{
                    scale: [1, 1.3, 1],
                    opacity: [0.5, 1, 0.5],
                  }}
                  transition={{
                    duration: 1,
                    repeat: Infinity,
                    delay: i * 0.2,
                  }}
                />
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
