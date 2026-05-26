// [UPDATED BY ANTIGRAVITY CLI - 2026-05-25]
// Project: Fingas
// Purpose: Premium vector-perfect branding — Monogram Logo + Wordmark matching favicon.svg.

import { cn } from '@/lib/cn';

export function LogoMark({ className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      className={cn('w-9 h-9 flex-shrink-0 drop-shadow-[0_0_15px_rgba(255,46,99,0.25)]', className)}
    >
      <defs>
        {/* Background Gradient */}
        <linearGradient id="logoBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1E293B" />
          <stop offset="100%" stopColor="#0B0F19" />
        </linearGradient>
        
        {/* Premium Crimson Gradient */}
        <linearGradient id="logoCrimsonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FF2E63" />
          <stop offset="50%" stopColor="#E11D48" />
          <stop offset="100%" stopColor="#9F1239" />
        </linearGradient>
        
        {/* Secondary Glow Gradient */}
        <linearGradient id="logoGlowGrad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#9F1239" stopOpacity={0.8} />
          <stop offset="100%" stopColor="#FF2E63" stopOpacity={0.1} />
        </linearGradient>

        {/* Metallic Silver Highlight */}
        <linearGradient id="logoSilverGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.7} />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0.25} />
        </linearGradient>
      </defs>

      {/* Outer container with rounded corners and glowing border */}
      <rect x="2" y="2" width="96" height="96" rx="28" fill="url(#logoBgGrad)" stroke="url(#logoGlowGrad)" strokeWidth="1.5" />
      
      {/* Subtle inner shadow/glow ring */}
      <rect x="6" y="6" width="88" height="88" rx="24" fill="none" stroke="#FFFFFF" strokeOpacity={0.06} strokeWidth="1" />

      {/* The stylized drop + chart + F logo mark */}
      <g>
        {/* Droplet background glow */}
        <path d="M50,22 C65,42 74,54 74,66 C74,79.25 63.25,90 50,90 C36.75,90 26,79.25 26,66 C26,54 35,42 50,22 Z" 
              fill="#9F1239" fillOpacity={0.2} />

        {/* Sleek outer fuel drop stroke */}
        <path d="M50,18 C67,40 76,53 76,66 C76,80.36 64.36,92 50,92 C35.64,92 24,80.36 24,66 C24,53 33,40 50,18 Z" 
              fill="none" stroke="url(#logoCrimsonGrad)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />

        {/* High-end Monogram "F" inside the drop, styled like an upward chart */}
        {/* Stem of F */}
        <path d="M43,40 L43,76" stroke="url(#logoSilverGrad)" strokeWidth="5" strokeLinecap="round" />
        
        {/* Top arm of F, pointing upwards like a trend chart */}
        <path d="M43,45 C52,45 61,42 66,35" fill="none" stroke="url(#logoCrimsonGrad)" strokeWidth="5.5" strokeLinecap="round" />
        
        {/* Middle arm of F */}
        <path d="M43,58 H59" stroke="url(#logoCrimsonGrad)" strokeWidth="5" strokeLinecap="round" />
        
        {/* Tiny glowing pulse dot at the tip of the upward trend */}
        <circle cx="66" cy="35" r="3.5" fill="#FFFFFF" />
        <circle cx="66" cy="35" r="2" fill="#FF2E63" />
      </g>
    </svg>
  );
}

export function Wordmark({ className }) {
  return (
    <div className={cn('inline-flex items-center', className)}>
      <span className="text-xl font-bold tracking-tight">
        <span className="text-ink">fin</span>
        <span className="text-brand-400">gas</span>
      </span>
    </div>
  );
}
