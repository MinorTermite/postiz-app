import { getT } from '@gitroom/react/translation/get.translation.service.backend';

export const dynamic = 'force-dynamic';
import { ReactNode } from 'react';
import loadDynamic from 'next/dynamic';
import { LogoTextComponent } from '@gitroom/frontend/components/ui/logo-text.component';
import { MantineWrapper } from '@gitroom/react/helpers/mantine.wrapper';
import { Toaster } from '@gitroom/react/toaster/toaster';
const ReturnUrlComponent = loadDynamic(() => import('./return.url.component'));

const features = [
  ['ВКонтакте, Одноклассники, MAX, Rutube, Telegram, YouTube', 'Один пост — во все площадки сразу, с отдельным текстом под каждую.'],
  ['Календарь публикаций', 'Планирование на недели вперёд, публикация по расписанию без вашего участия.'],
  ['Статистика каналов', 'Просмотры, подписчики и реакции по каждой площадке в одном окне.'],
  ['Медиатека', 'Ролики, обложки и фото для карточек и постов хранятся в одном месте.'],
];

export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  const t = await getT();

  return (
    <MantineWrapper>
      <Toaster />
      <div className="bg-[#0E0E0E] flex flex-1 p-[12px] gap-[12px] min-h-screen w-screen text-white">
        <ReturnUrlComponent />
        <div className="flex flex-col py-[40px] px-[20px] flex-1 lg:w-[600px] lg:flex-none rounded-[12px] text-white p-[12px] bg-[#1A1919]">
          <div className="w-full max-w-[440px] mx-auto justify-center gap-[20px] h-full flex flex-col text-white">
            <LogoTextComponent />
            <div className="flex">{children}</div>
          </div>
        </div>
        <div className="flex-1 pt-[88px] px-[40px] hidden lg:flex flex-col items-center">
          <div className="max-w-[560px] w-full flex flex-col gap-[28px]">
            <div className="text-[34px] leading-[1.2] font-[600]">
              GravMix — соцсети и продвижение продукции
              <br />
              <span className="text-[#FF7A18]">из одного окна</span>
            </div>
            {features.map(([title, text]) => (
              <div key={title} className="flex flex-col gap-[6px] border-s-[3px] border-[#C13CFF] ps-[16px]">
                <div className="text-[18px] font-[600]">{title}</div>
                <div className="text-[15px] text-[#B5B5B5]">{text}</div>
              </div>
            ))}
            <div className="text-[13px] text-[#777]">
              Программа работает на вашем компьютере. Данные уходят только в подключённые соцсети.
            </div>
          </div>
        </div>
      </div>
    </MantineWrapper>
  );
}
