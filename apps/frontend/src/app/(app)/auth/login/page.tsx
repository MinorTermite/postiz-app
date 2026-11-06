export const dynamic = 'force-dynamic';
import { Login } from '@gitroom/frontend/components/auth/login';
import { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { internalFetch } from '@gitroom/helpers/utils/internal.fetch';
export const metadata: Metadata = {
  title: 'GravMix — вход',
  description: '',
};
export default async function Auth() {
  if (process.env.DISABLE_REGISTRATION === 'true') {
    const canRegister = (
      await (await internalFetch('/auth/can-register')).json()
    ).register;
    if (canRegister) {
      redirect('/auth');
    }
  }
  return <Login />;
}
