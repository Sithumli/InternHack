import { useState, useRef, useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: "right" | "left" | "top" | "bottom";
  sideOffset?: number;
  disabled?: boolean;
}

export function Tooltip({
  content,
  children,
  side = "right",
  sideOffset = 8,
  disabled = false,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const updateCoords = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    let top = 0;
    let left = 0;

    if (side === "right") {
      top = rect.top + rect.height / 2;
      left = rect.right + sideOffset;
    } else if (side === "left") {
      top = rect.top + rect.height / 2;
      left = rect.left - sideOffset;
    } else if (side === "top") {
      top = rect.top - sideOffset;
      left = rect.left + rect.width / 2;
    } else if (side === "bottom") {
      top = rect.bottom + sideOffset;
      left = rect.left + rect.width / 2;
    }

    setCoords({ top, left });
  };

  useEffect(() => {
    if (!isVisible) return;

    const handleScrollOrResize = () => {
      updateCoords();
    };

    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);

    return () => {
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [isVisible]);

  if (disabled || !content) {
    return <>{children}</>;
  }

  const handleMouseEnter = () => {
    updateCoords();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, 100);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  return (
    <div
      ref={triggerRef}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className="inline-flex max-w-full"
    >
      {children}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isVisible && (
              <motion.div
                initial={{
                  opacity: 0,
                  scale: 0.94,
                  x: side === "right" ? -6 : side === "left" ? 6 : 0,
                  y: side === "bottom" ? -6 : side === "top" ? 6 : 0,
                }}
                animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
                exit={{ opacity: 0, scale: 0.94 }}
                transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
                style={{
                  position: "fixed",
                  top: coords.top,
                  left: coords.left,
                  transform:
                    side === "right"
                      ? "translateY(-50%)"
                      : side === "left"
                      ? "translate(-100%, -50%)"
                      : side === "top"
                      ? "translate(-50%, -100%)"
                      : "translate(-50%, 0)",
                  pointerEvents: "none",
                  zIndex: 9999,
                }}
                className="px-2.5 py-1.5 rounded-md text-xs font-semibold tracking-wide bg-stone-900 text-stone-50 dark:bg-stone-100 dark:text-stone-950 border border-stone-800 dark:border-stone-200 shadow-xl whitespace-nowrap flex items-center gap-1.5"
              >
                {content}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
}
