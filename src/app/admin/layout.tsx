import { redirect } from 'next/navigation';
import { getIsAdmin } from '@/lib/admin-auth';
import { getPendingRequestCount } from '@/lib/db';
import AdminNav from './AdminNav';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  // Defense-in-depth: guard the entire admin layout in addition to individual pages.
  // Prevents any future page or RSC streaming gap from exposing admin UI.
  if (!(await getIsAdmin())) redirect('/login');

  const pendingCount = getPendingRequestCount();
  return (
    <>
      <AdminNav pendingCount={pendingCount} />
      {children}
    </>
  );
}
