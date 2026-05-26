// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: Animated bottom sheet — preferred over modals in mobile-first apps.

import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/cn';

export function BottomSheet({ open, onClose, title, children, className }) {
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
            className={cn(
              'fixed left-0 right-0 bottom-0 z-50',
              'rounded-t-3xl bg-bg-card border-t border-line shadow-sheet',
              'safe-bottom',
              className,
            )}
          >
            <div className="flex justify-center py-2">
              <div className="w-10 h-1.5 rounded-full bg-line" />
            </div>
            {title && (
              <div className="px-5 pb-3">
                <h2 className="text-lg font-semibold text-ink">{title}</h2>
              </div>
            )}
            <div className="px-5 pb-5 max-h-[80vh] overflow-y-auto">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
