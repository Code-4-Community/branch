import { useState } from 'react';
import { useApi } from '@/hooks/useApi';

type FileType = 'pdf' | 'docx';
type ReportType = 'technical' | 'narrative';

interface UseGenerateReportParams {
  onSuccess: () => Promise<void> | void;
}

export function useGenerateReport({ onSuccess }: UseGenerateReportParams) {
  const api = useApi();
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateProjectId, setGenerateProjectId] = useState<string>('');
  const [generateFileType, setGenerateFileType] = useState<FileType>('pdf');
  const [generateReportName, setGenerateReportName] = useState<string>('');
  const [generateReportType, setGenerateReportType] = useState<ReportType>('technical');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (!generateProjectId) {
      setError('Select a project before generating a report');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      await api.post('/reports/generate', {
        project_id: parseInt(generateProjectId, 10),
        file_type: generateFileType,
        report_type: generateReportType,
        // Omitted entirely when blank, so the backend falls back to its own
        // auto-generated "<project> — <date>" title — same behavior as before
        // this field existed.
        ...(generateReportName.trim() ? { title: generateReportName.trim() } : {}),
      });
      await onSuccess();
      setShowGenerateModal(false);
      setGenerateReportName('');
      setGenerateReportType('technical');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Failed to generate report',
      );
    } finally {
      setGenerating(false);
    }
  }

  return {
    showGenerateModal,
    setShowGenerateModal,
    generateProjectId,
    setGenerateProjectId,
    generateFileType,
    setGenerateFileType,
    generateReportName,
    setGenerateReportName,
    generateReportType,
    setGenerateReportType,
    generating,
    error,
    setError,
    handleGenerate,
  };
}