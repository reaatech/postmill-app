import { Metadata } from 'next';
import { AuthProviders } from '@gitroom/frontend/components/admin/auth-providers';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Postmill Admin — Auth Providers',
  description: 'Manage platform-wide login providers',
};

export default async function AdminPage() {
  return <AuthProviders />;
}
