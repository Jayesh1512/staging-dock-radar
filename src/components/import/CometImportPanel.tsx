'use client';
import { useState } from 'react';
import { scoreChunked } from '@/lib/score-utils';
import type { Article } from '@/lib/types';

interface ImportStats {
  totalFetched: number;
  afterDedup: number;
  afterScoreFilter: number;
  stored: number;
  dedupRemoved: number;
}

export function CometImportPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [jsonInput, setJsonInput] = useState('');
  const [phase, setPhase] = useState<'input' | 'importing' | 'imported' | 'scoring' | 'scored'>('input');
  const [articles, setArticles] = useState<Article[]>([]);
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [runId, setRunId] = useState('');
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState<string>('');
  const [scoreResults, setScoreResults] = useState<any[]>([]);
  const [articlesScored, setArticlesScored] = useState(0);

  const handleImport = async () => {
    if (!jsonInput.trim()) {
      setError('Please paste JSON articles');
      return;
    }

    setPhase('importing');
    setError('');
    setValidationErrors('');

    try {
      let data;
      try {
        data = JSON.parse(jsonInput);
      } catch {
        throw new Error('Invalid JSON format');
      }

      // Handle Comet crawler response format
      const articlesToImport = data.articles || (Array.isArray(data) ? data : []);
      if (!Array.isArray(articlesToImport)) {
        throw new Error('Expected articles array in JSON');
      }

      const res = await fetch('/api/import-articles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          articles: articlesToImport,
          source: 'comet_crawler',
          maxArticles: 50,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        
        // Handle schema validation errors
        if (errData.details) {
          setValidationErrors(errData.details);
          setError(`Schema validation failed (${errData.errorCount} errors)`);
        } else {
          setError(errData.error || `HTTP ${res.status}`);
        }
        setPhase('input');
        return;
      }

      const result = await res.json();
      setRunId(result.runId);
      setArticles(result.articles);
      setStats(result.stats);
      setPhase('imported');
      setJsonInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setPhase('input');
    }
  };

  const handleScore = async () => {
    if (!articles.length) return;
    setPhase('scoring');

    try {
      const results = await scoreChunked(articles);
      const aboveThreshold = results.filter(
        r => r.scored.relevance_score >= 40 && !r.scored.is_duplicate && !r.scored.drop_reason
      ).length;

      setArticlesScored(aboveThreshold);
      setScoreResults(results);
      setPhase('scored');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Scoring failed');
      setPhase('imported');
    }
  };

  const reset = () => {
    setPhase('input');
    setArticles([]);
    setStats(null);
    setRunId('');
    setError('');
    setValidationErrors('');
    setScoreResults([]);
    setArticlesScored(0);
    setJsonInput('');
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        style={{
          fontSize: 12,
          fontWeight: 600,
          padding: '5px 14px',
          borderRadius: 7,
          border: '1px solid #E5E7EB',
          background: '#F9FAFB',
          color: '#374151',
          cursor: 'pointer',
        }}
      >
        📥 Import Articles
      </button>

      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setIsOpen(false);
              reset();
            }
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 12,
              width: 700,
              maxHeight: '90vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '14px 20px',
                borderBottom: '1px solid #E5E7EB',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexShrink: 0,
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 14, color: '#111827' }}>
                📥 Import & Score Articles
              </span>
              <button
                onClick={() => {
                  setIsOpen(false);
                  reset();
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 18,
                  color: '#9CA3AF',
                  cursor: 'pointer',
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
              {phase === 'input' && (
                <div>
                  <p style={{ fontSize: 13, color: '#6B7280', marginBottom: 12 }}>
                    Paste the JSON export from your Comet crawler. Expected format:
                  </p>
                  <pre
                    style={{
                      background: '#F3F4F6',
                      padding: 10,
                      borderRadius: 6,
                      fontSize: 11,
                      color: '#374151',
                      overflow: 'auto',
                      maxHeight: 120,
                      marginBottom: 12,
                    }}
                  >
                    {`{
  "articles": [
    {
      "title": "Article Headline",
      "url": "https://example.com/article",
      "normalized_url": "example.com/article",
      "snippet": "Summary...",
      "publisher": "Source Name",
      "published_at": "2026-03-17T10:00:00Z",
      "source": "dronelife"
    }
  ]
}`}
                  </pre>

                  <textarea
                    value={jsonInput}
                    onChange={(e) => setJsonInput(e.target.value)}
                    placeholder="Paste JSON here"
                    style={{
                      width: '100%',
                      height: 200,
                      padding: 10,
                      border: '1px solid #E5E7EB',
                      borderRadius: 6,
                      fontSize: 12,
                      fontFamily: 'monospace',
                      marginBottom: 12,
                      boxSizing: 'border-box',
                    }}
                  />

                  {error && (
                    <div
                      style={{
                        padding: 10,
                        background: '#FEE2E2',
                        border: '1px solid #FECACA',
                        borderRadius: 6,
                        fontSize: 12,
                        color: '#DC2626',
                        marginBottom: 12,
                      }}
                    >
                      {error}
                    </div>
                  )}

                  {validationErrors && (
                    <details
                      style={{
                        marginBottom: 12,
                        padding: 10,
                        background: '#FEF2F2',
                        border: '1px solid #FECACA',
                        borderRadius: 6,
                        cursor: 'pointer',
                      }}
                    >
                      <summary style={{ fontWeight: 600, color: '#991B1B', marginBottom: 8, cursor: 'pointer' }}>
                        Validation Errors (click to expand)
                      </summary>
                      <pre
                        style={{
                          fontSize: 10,
                          color: '#DC2626',
                          overflow: 'auto',
                          maxHeight: 200,
                          margin: 0,
                          whiteSpace: 'pre-wrap',
                          wordWrap: 'break-word',
                          fontFamily: 'monospace',
                        }}
                      >
                        {validationErrors}
                      </pre>
                    </details>
                  )}

                  <button
                    onClick={handleImport}
                    disabled={!jsonInput.trim()}
                    style={{
                      width: '100%',
                      padding: '10px 16px',
                      background: jsonInput.trim() ? '#3B82F6' : '#D1D5DB',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: jsonInput.trim() ? 'pointer' : 'not-allowed',
                    }}
                  >
                    Import Articles
                  </button>
                </div>
              )}

              {phase === 'importing' && (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
                  <p style={{ fontSize: 14, color: '#6B7280' }}>Importing articles...</p>
                </div>
              )}

              {(phase === 'imported' || phase === 'scoring' || phase === 'scored') && stats && (
                <div>
                  <div
                    style={{
                      background: '#F0FDF4',
                      border: '1px solid #86EFAC',
                      borderRadius: 6,
                      padding: 12,
                      marginBottom: 16,
                      fontSize: 13,
                    }}
                  >
                    <div style={{ fontWeight: 600, color: '#16A34A', marginBottom: 8 }}>
                      ✅ Import successful (Run ID: {runId})
                    </div>
                    <div style={{ color: '#4B5563', fontSize: 12, lineHeight: 1.6 }}>
                      <div>Total imported: {stats.totalFetched}</div>
                      <div>After dedup: {stats.afterDedup}</div>
                      <div>Ready for scoring: {stats.stored}</div>
                      <div>Duplicates removed: {stats.dedupRemoved}</div>
                    </div>
                  </div>

                  {phase === 'imported' && (
                    <button
                      onClick={handleScore}
                      style={{
                        width: '100%',
                        padding: '10px 16px',
                        background: '#10B981',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Proceed to Scoring (Step 2)
                    </button>
                  )}

                  {phase === 'scoring' && (
                    <div style={{ textAlign: 'center', padding: '20px' }}>
                      <div style={{ fontSize: 24, marginBottom: 8 }}>⚡</div>
                      <p style={{ fontSize: 13, color: '#6B7280' }}>Scoring articles with LLM...</p>
                    </div>
                  )}

                  {phase === 'scored' && (
                    <div>
                      <div
                        style={{
                          background: '#EFF6FF',
                          border: '1px solid #93C5FD',
                          borderRadius: 6,
                          padding: 12,
                          marginBottom: 12,
                          fontSize: 13,
                        }}
                      >
                        <div style={{ fontWeight: 600, color: '#1E40AF', marginBottom: 6 }}>
                          ⭐ Scoring complete
                        </div>
                        <div style={{ color: '#3730A3', fontSize: 12 }}>
                          {articlesScored} article(s) scored above threshold
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          setIsOpen(false);
                          reset();
                        }}
                        style={{
                          width: '100%',
                          padding: '10px 16px',
                          background: '#6B7280',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 6,
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Close
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
