import { LinkedinCompanyPostsUtility } from '@/components/utilities/LinkedinCompanyPostsUtility';

export default function LinkedinCompanyPostsPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#F8FAFC' }}>
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '16px 16px 0', color: '#334155', fontSize: 12.5 }}>
        Utility Route: LinkedIn Company Posts
      </div>
      <LinkedinCompanyPostsUtility />
    </main>
  );
}
