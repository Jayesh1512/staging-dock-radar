import { Navbar } from '@/components/shared/Navbar';
import { LinkedinCompanyPostsUtility } from '@/components/utilities/LinkedinCompanyPostsUtility';

export default function LinkedinCompanyPostsPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#F8FAFC' }}>
      <Navbar />
      <LinkedinCompanyPostsUtility />
    </main>
  );
}
