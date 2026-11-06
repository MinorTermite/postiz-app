import React from 'react';

export const LogoTextComponent = () => {
  return (
    <div className="flex items-center gap-[10px]">
      <svg width="36" height="36" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="gravmix-text-logo" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FF7A18" />
            <stop offset="1" stopColor="#C13CFF" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="16" fill="url(#gravmix-text-logo)" />
        <path
          d="M45 22.5A16 16 0 1 0 47.5 36H33v-7h22a24 24 0 0 1 0 3c0 12.7-10.3 23-23 23S9 44.7 9 32 19.3 9 32 9c6.4 0 12.2 2.6 16.3 6.8z"
          fill="#fff"
        />
      </svg>
      <span className="text-[26px] font-[700] tracking-[-0.5px]">GravMix</span>
    </div>
  );
};
