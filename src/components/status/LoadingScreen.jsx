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

        {/* Animated Gas Nozzle & Pouring Gasoline */}
        <div className="relative w-28 h-28 mt-2 flex items-center justify-center select-none">
          {/* Custom Minimalist Vector Gas Nozzle */}
          <svg
            viewBox="0 0 100 100"
            className="w-16 h-16 absolute top-2 left-2 text-ink-soft/40 drop-shadow-[0_4px_10px_rgba(0,0,0,0.06)]"
          >
            {/* Handle */}
            <path
              d="M20 40 L35 35 L48 48 L42 54 Z"
              fill="currentColor"
              className="text-ink-soft/30 dark:text-white/10"
            />
            {/* Guard */}
            <path
              d="M38 38 C35 48 45 52 48 46"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
              className="text-ink-soft/50 dark:text-white/20"
            />
            {/* Core metallic body */}
            <path
              d="M32 32 L55 32 L60 44 L44 44 Z"
              fill="currentColor"
              className="text-ink-muted dark:text-white/70"
            />
            {/* Metal Spout tilted down-right */}
            <path
              d="M55 35 L76 49"
              stroke="currentColor"
              strokeWidth="4.5"
              strokeLinecap="round"
              className="text-ink dark:text-white"
            />
            {/* Spout tip color accent */}
            <path
              d="M74 48 L77 50"
              stroke="currentColor"
              strokeWidth="6"
              strokeLinecap="round"
              className="text-brand-500"
            />
          </svg>

          {/* Staggered continuous pouring gasoline droplets */}
          {[0, 1, 2, 3].map((index) => (
            <motion.div
              key={index}
              animate={{
                x: [24, 34, 40], // Flow direction
                y: [4, 28, 52],
                scale: [0.3, 1.1, 0.7],
                opacity: [0, 1, 1, 0],
              }}
              transition={{
                duration: 1.1,
                repeat: Infinity,
                ease: 'easeIn',
                delay: index * 0.28,
              }}
              className="absolute w-2.5 h-3.5 bg-gradient-to-b from-amber-400 to-yellow-300 shadow-[0_0_8px_rgba(245,158,11,0.6)] pointer-events-none"
              style={{
                borderRadius: '50% 50% 50% 50% / 80% 80% 40% 40%',
                transform: 'rotate(-33deg)',
                top: '42px',
                left: '46px',
              }}
            />
          ))}

          {/* Splash ring at the bottom where fuel lands */}
          <motion.div
            animate={{
              scale: [0.8, 1.25, 0.8],
              opacity: [0.3, 0.7, 0.3],
            }}
            transition={{
              duration: 0.55,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute w-7 h-1.5 bg-amber-400/25 rounded-full blur-[0.5px] shadow-[0_0_8px_rgba(245,158,11,0.5)] pointer-events-none"
            style={{
              bottom: '12px',
              right: '12px',
            }}
          />
        </div>
      </div>
    </div>
  );
}
