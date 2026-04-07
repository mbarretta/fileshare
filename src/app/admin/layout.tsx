import { getPendingRequestCount } from '@/lib/db';
import AdminNav from './AdminNav';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const pendingCount = getPendingRequestCount();
  return (
    <>
      <AdminNav pendingCount={pendingCount} />
      {children}
    </>
  );
}
