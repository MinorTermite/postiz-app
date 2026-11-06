'use client';

import { FC } from 'react';
import dynamic from 'next/dynamic';
import { useVariables } from '@gitroom/react/helpers/variable.context';
import { useT } from '@gitroom/react/translation/get.transation.service.client';
import { GoogleProvider } from '@gitroom/frontend/components/auth/providers/google.provider';
import { AppleProvider } from '@gitroom/frontend/components/auth/providers/apple.provider';
import { FarcasterProvider } from '@gitroom/frontend/components/auth/providers/farcaster.provider';
import { WalletUiProvider } from '@gitroom/frontend/components/auth/providers/placeholder/wallet.ui.provider';

const WalletProvider = dynamic(
  () => import('@gitroom/frontend/components/auth/providers/wallet.provider'),
  { ssr: false, loading: () => <WalletUiProvider /> }
);

export const GravMixMark: FC<{ size?: number; id: string }> = ({
  size = 28,
  id,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#FF7A18" />
        <stop offset="1" stopColor="#C13CFF" />
      </linearGradient>
    </defs>
    <rect width="64" height="64" rx="16" fill={`url(#${id})`} />
    <path
      d="M45 22.5A16 16 0 1 0 47.5 36H33v-7h22a24 24 0 0 1 0 3c0 12.7-10.3 23-23 23S9 44.7 9 32 19.3 9 32 9c6.4 0 12.2 2.6 16.3 6.8z"
      fill="#fff"
    />
  </svg>
);

export const AuthDivider: FC<{ text: string }> = ({ text }) => (
  <div className="flex items-center gap-[12px] my-[22px] text-[13px] text-[#8C8C8C]">
    <div className="flex-1 h-[1px] bg-[#ffffff1f]" />
    <div>{text}</div>
    <div className="flex-1 h-[1px] bg-[#ffffff1f]" />
  </div>
);

export const QuickLoginGroup = () => {
  const t = useT();
  const { googleLogin, appleClientId, neynarClientId, billingEnabled } =
    useVariables();
  const extra = !!appleClientId || !!neynarClientId || billingEnabled;

  if (!googleLogin && !extra) {
    return null;
  }

  return (
    <>
      <div className="rounded-[18px] p-[1px] bg-gradient-to-br from-[#FF7A18] via-[#E0569A] to-[#C13CFF] shadow-[0_10px_40px_-12px_rgba(193,60,255,0.45)]">
        <div className="rounded-[17px] bg-[#151414] p-[18px] flex flex-col gap-[14px]">
          <div className="flex items-center gap-[12px]">
            <GravMixMark id="gravmix-quick-login" size={34} />
            <div className="flex flex-col">
              <div className="text-[16px] font-[600] leading-[1.2]">
                {t('gravmix_quick_login', 'Быстрый вход в GravMix')}
              </div>
              <div className="text-[13px] text-[#9A9A9A]">
                {t(
                  'gravmix_quick_login_hint',
                  'Один клик — без пароля'
                )}
              </div>
            </div>
          </div>
          {googleLogin && <GoogleProvider />}
          {extra && (
            <div className="gap-[8px] flex">
              {!!appleClientId && <AppleProvider />}
              {!!neynarClientId && <FarcasterProvider />}
              {billingEnabled && <WalletProvider />}
            </div>
          )}
        </div>
      </div>
      <AuthDivider text={t('or_by_email', 'или по почте')} />
    </>
  );
};
