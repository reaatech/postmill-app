'use client';

import { FC, useState, useCallback } from 'react';
import { useFetch } from '@gitroom/helpers/utils/custom.fetch';
import { useT } from '@gitroom/react/translation/get.transation.service.client';

interface Violation {
  type: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
}

interface ComplianceResult {
  passed: boolean;
  violations: Violation[];
  suggestions: string[];
}

export const AICompliance: FC<{ content?: string; platform?: string }> = ({
  content: externalContent,
  platform,
}) => {
  const t = useT();
  const fetch = useFetch();
  const [content, setContent] = useState(externalContent || '');
  const [result, setResult] = useState<ComplianceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCheck = useCallback(async () => {
    if (!content.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/ai/compliance', {
        method: 'POST',
        body: JSON.stringify({ content: content.trim(), platform }),
      });
      if (!res.ok) throw new Error('Compliance check failed');
      const data = await res.json();
      setResult(data as ComplianceResult);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [content, platform, fetch]);

  const severityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'text-red-500';
      case 'medium': return 'text-yellow-500';
      case 'low': return 'text-blue-500';
      default: return 'text-newTableText';
    }
  };

  return (
    <div className="flex flex-col gap-[12px]">
      <div className="text-[14px] font-medium">
        {t('content_compliance', 'Content Compliance Checker')}
      </div>
      <div className="text-[12px] text-customColor18">
        {t('content_compliance_description', 'Check your post content for platform ToS violations, brand safety concerns, and regulatory issues.')}
      </div>

      {!externalContent && (
        <textarea
          className="bg-forth border border-tableBorder rounded-[4px] min-h-[80px] p-[12px] text-textColor resize-y bg-newBgColor text-[13px]"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={t('compliance_placeholder', 'Paste your post content here...')}
        />
      )}

      <button
        onClick={handleCheck}
        disabled={loading || !content.trim()}
        className="bg-customColor4 text-white rounded-[4px] px-[16px] py-[8px] text-[13px] hover:opacity-90 disabled:opacity-50 self-start"
      >
        {loading
          ? t('checking', 'Checking...')
          : t('check_compliance', 'Check Compliance')}
      </button>

      {error && (
        <div className="text-red-500 text-[13px]">{error}</div>
      )}

      {result && (
        <div className={`border rounded-[8px] p-[16px] ${result.passed ? 'border-green-500 bg-green-900/10' : 'border-red-500 bg-red-900/10'}`}>
          <div className={`text-[14px] font-medium ${result.passed ? 'text-green-500' : 'text-red-500'}`}>
            {result.passed
              ? t('compliance_passed', 'No issues found')
              : t('compliance_issues', `Found ${result.violations.length} issue(s)`)}
          </div>

          {result.violations.length > 0 && (
            <ul className="mt-[8px] flex flex-col gap-[6px]">
              {result.violations.map((v, i) => (
                <li key={i} className="text-[13px] flex items-start gap-[6px]">
                  <span className={`${severityColor(v.severity)} font-medium shrink-0`}>
                    [{v.severity}]
                  </span>
                  <span className="text-newTableText">{v.description}</span>
                </li>
              ))}
            </ul>
          )}

          {result.suggestions.length > 0 && (
            <div className="mt-[12px]">
              <div className="text-[13px] font-medium text-newTableText mb-[4px]">
                {t('suggestions', 'Suggestions')}
              </div>
              <ul className="flex flex-col gap-[4px]">
                {result.suggestions.map((s, i) => (
                  <li key={i} className="text-[12px] text-newTableText">
                    - {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
