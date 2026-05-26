// [UPDATED BY ANTIGRAVITY CLI - 2026-05-26]
// Project: Fingas
// Purpose: Fullscreen premium loader with a beautiful glowing spin circle.

import { Wordmark } from '@/components/ui/Logo';
import { motion } from 'framer-motion';

export function LoadingScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-bg relative overflow-hidden">
      {/* Subtle brand glow spot */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-brand-500/5 blur-3xl pointer-events-none rounded-full" />
      
      <div className="flex flex-col items-center gap-6 z-10">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Wordmark className="text-3xl font-black" />
        </motion.div>

        {/* Gorgeous premium brand spinner circle */}
        <div className="relative flex items-center justify-center w-10 h-10 mt-2">
          {/* Transparent base track */}
          <div className="absolute inset-0 rounded-full border-[3px] border-brand-500/10" />
          
          {/* Rotating glow segment */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 0.95, ease: 'linear' }}
            className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-brand-500 border-r-brand-400 shadow-[0_0_12px_rgba(159,18,57,0.35)]"
          />
        </div>
      </div>
    </div>
  );
}
