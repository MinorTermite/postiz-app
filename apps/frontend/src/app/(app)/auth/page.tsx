import { internalFetch } from '@gitroom/helpers/utils/internal.fetch';
export const dynamic = 'force-dynamic';
import { Register } from '@gitroom/frontend/components/auth/register';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
export const metadata: Metadata = {
  title: 'GravMix — создание аккаунта',
  description: '',
};
export default async function Auth(params: {searchParams: Promise<{provider: string}>}) {
  if (process.env.DISABLE_REGISTRATION === 'true') {
    const canRegister = (
      await (await internalFetch('/auth/can-register')).json()
    ).register;
    if (!canRegister && !(await params?.searchParams)?.provider) {
      redirect('/auth/login');
    }
  }
  return (
    <div className="flex flex-col gap-[16px] w-full">
      <div className="text-[15px] text-[#B5B5B5]">
        Первый запуск: создайте аккаунт владельца GravMix. После этого регистрация закроется, вход — только по этой почте и паролю.
      </div>
      <Register />
    </div>
  );
}
