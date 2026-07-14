import { useState } from 'react';
import { apiFetch } from '@/lib/api';

type FileType = 'pdf' | 'docx';

interface UseGenerateReportParams {
  token: string;
  onSuccess: () => Promise<void> | void;
}

export function useGenerateReport({ token, onSuccess }: UseGenerateReportParams) {
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
      await apiFetch('/reports/generate', {
        token,
        method: 'POST',
        body: JSON.stringify({
          project_id: parseInt(generateProjectId, 10),
          file_type: generateFileType,
        }),
      });
      await onSuccess();
      setShowGenerateModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
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