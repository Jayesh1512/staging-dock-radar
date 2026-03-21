import { LinkedinScanDashboard } from '@/components/linkedin-scan/LinkedinScanDashboard';

export default function LinkedinScanResultsPage() {
  return (
    <main style={{ minHeight: '100vh', background: '#F8FAFC' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h1 style={{ fontSize: 18, fontWeight: 800, color: '#111827', margin: 0 }}>
            LinkedIn DJI Dock Scan Results
          </h1>
          <span style={{ fontSize: 11, color: '#6B7280' }}>
            Hypothesis: DJI reseller mentions DJI Dock on LinkedIn = DSP/SI prospect
          </span>
        </div>
        <div style={{ fontSize: 12, color: '#6B7280', marginBottom: 8 }}>
          BFP = FlytBase Partners (benchmark) &middot; B1-B7 = DJI Reseller batches by priority
        </div>
      </div>
      <LinkedinScanDashboard />
    </main>
  );
}
