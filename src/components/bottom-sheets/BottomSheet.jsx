// [UPDATED BY CLAUDE CLI - 2026-05-26]
// Project: Fingas
// Purpose: Animated bottom sheet — preferred over modals in mobile-first apps.
// Поддерживает свайп вниз для закрытия (нативный жест на мобильных).

import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/cn';

// Закрываем если потянули вниз больше чем на 120px или скорость >500px/s.
const CLOSE_DRAG_PX = 120;
const CLOSE_DRAG_VELOCITY = 500;

export function BottomSheet({ open, onClose, title, children, className }) {
  function handleDragEnd(_, info) {
    if (info.offset.y > CLOSE_DRAG_PX || info.velocity.y > CLOSE_DRAG_VELOCITY) {
      onClose?.();
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 bg-black/60 z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 40 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            dragMomentum={false}
            onDragEnd={handleDragEnd}
            className={cn(
              'fixed left-0 right-0 bottom-0 z-50',
              'rounded-t-3xl bg-bg-card border-t border-line shadow-sheet',
              'safe-bottom touch-pan-y',
              className,
            )}
          >
            {/* Drag-зона — крупная и явная, чтобы попасть пальцем. */}
            <div className="flex justify-center py-3 cursor-grab active:cursor-grabbing">
              <div className="w-12 h-1.5 rounded-full bg-line" />
            </div>
            {title && (
              <div className="px-5 pb-3">
                <h2 className="text-lg font-semibold text-ink">{title}</h2>
              </div>
            )}
            <div
              className="px-5 pb-5 max-h-[80vh] overflow-y-auto overscroll-contain"
              // Чтобы свайп по содержимому не мешал прокрутке формы:
              // тащим лист только за хэндл сверху. onPointerDownCapture
              // останавливает drag motion'а внутри прокручиваемой зоны.
              onPointerDownCapture={(e) => e.stopPropagation()}
            >
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
