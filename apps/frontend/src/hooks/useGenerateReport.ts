import { useState } from 'react';
import { useApi } from '@/hooks/useApi';

type FileType = 'pdf' | 'docx';

interface UseGenerateReportParams {
  onSuccess: () => Promise<void> | void;
}

export function useGenerateReport({ onSuccess }: UseGenerateReportParams) {
  const api = useApi();
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [generateProjectId, setGenerateProjectId] = useState<string>('');
  const [generateFileType, setGenerateFileType] = useState<FileType>('pdf');
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
      });
      await onSuccess();
      setShowGenerateModal(false);
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
    generating,
    error,
    setError,
    handleGenerate,
  };
}
