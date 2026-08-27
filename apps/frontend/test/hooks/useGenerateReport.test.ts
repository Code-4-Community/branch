import { renderHook, act, waitFor } from '@testing-library/react';
import { useGenerateReport } from '../../src/hooks/useGenerateReport';
import { useApi } from '../../src/hooks/useApi';

jest.mock('../../src/hooks/useApi', () => ({
  useApi: jest.fn(),
}));

const mockPost = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  (useApi as jest.Mock).mockReturnValue({ post: mockPost });
});

describe('useGenerateReport', () => {
  describe('validation', () => {
    it('sets an error and never calls api.post when no project is selected', async () => {
      const onSuccess = jest.fn();
      const { result } = renderHook(() => useGenerateReport({ onSuccess }));

      await act(async () => {
        await result.current.handleGenerate();
      });

      expect(mockPost).not.toHaveBeenCalled();
      expect(result.current.error).toBe('Select a project before generating a report');
      expect(onSuccess).not.toHaveBeenCalled();
    });
  });

  describe('request body', () => {
    it('sends project_id as a number, the selected file_type, and report_type, with no title key when the name is blank', async () => {
      mockPost.mockResolvedValueOnce({ ok: true });
      const onSuccess = jest.fn();
      const { result } = renderHook(() => useGenerateReport({ onSuccess }));

      act(() => {
        result.current.setGenerateProjectId('7');
        result.current.setGenerateFileType('docx');
        result.current.setGenerateReportType('narrative');
      });

      await act(async () => {
        await result.current.handleGenerate();
      });

      expect(mockPost).toHaveBeenCalledWith('/reports/generate', {
        project_id: 7,
        file_type: 'docx',
        report_type: 'narrative',
      });
    });

    it('includes a trimmed title when a report name is provided', async () => {
      mockPost.mockResolvedValueOnce({ ok: true });
      const { result } = renderHook(() => useGenerateReport({ onSuccess: jest.fn() }));

      act(() => {
        result.current.setGenerateProjectId('1');
        result.current.setGenerateReportName('  Q3 Board Report  ');
      });

      await act(async () => {
        await result.current.handleGenerate();
      });

      expect(mockPost).toHaveBeenCalledWith('/reports/generate', expect.objectContaining({
        title: 'Q3 Board Report',
      }));
    });

    it('omits the title key entirely when the report name is only whitespace', async () => {
      mockPost.mockResolvedValueOnce({ ok: true });
      const { result } = renderHook(() => useGenerateReport({ onSuccess: jest.fn() }));

      act(() => {
        result.current.setGenerateProjectId('1');
        result.current.setGenerateReportName('    ');
      });

      await act(async () => {
        await result.current.handleGenerate();
      });

      const [, body] = mockPost.mock.calls[0];
      expect(body).not.toHaveProperty('title');
    });
  });

  describe('success path', () => {
    it('awaits onSuccess, closes the modal, and resets name/type back to defaults', async () => {
      mockPost.mockResolvedValueOnce({ ok: true });
      const onSuccess = jest.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() => useGenerateReport({ onSuccess }));

      act(() => {
        result.current.setGenerateProjectId('1');
        result.current.setGenerateReportName('Some Report');
        result.current.setGenerateReportType('narrative');
        result.current.setShowGenerateModal(true);
      });

      await act(async () => {
        await result.current.handleGenerate();
      });

      expect(onSuccess).toHaveBeenCalledTimes(1);
      expect(result.current.showGenerateModal).toBe(false);
      expect(result.current.generateReportName).toBe('');
      expect(result.current.generateReportType).toBe('technical');
      expect(result.current.error).toBeNull();
    });

    // The project selection itself isn't part of the reset -- unlike name/type,
    // there's no default to fall back to, and clearing it would just force the
    // user to re-pick the same project on their very next generate.
    it('does not reset generateProjectId after a successful generate', async () => {
      mockPost.mockResolvedValueOnce({ ok: true });
      const { result } = renderHook(() => useGenerateReport({ onSuccess: jest.fn() }));

      act(() => {
        result.current.setGenerateProjectId('3');
      });

      await act(async () => {
        await result.current.handleGenerate();
      });

      expect(result.current.generateProjectId).toBe('3');
    });
  });

  describe('error path', () => {
    it('surfaces the thrown error message and leaves the modal open', async () => {
      mockPost.mockRejectedValueOnce(new Error('Project not found'));
      const onSuccess = jest.fn();
      const { result } = renderHook(() => useGenerateReport({ onSuccess }));

      act(() => {
        result.current.setGenerateProjectId('999');
        result.current.setShowGenerateModal(true);
      });

      await act(async () => {
        await result.current.handleGenerate();
      });

      expect(result.current.error).toBe('Project not found');
      expect(result.current.showGenerateModal).toBe(true);
      expect(onSuccess).not.toHaveBeenCalled();
    });

    it('falls back to a generic message when the rejection is not an Error instance', async () => {
      mockPost.mockRejectedValueOnce('some string rejection');
      const { result } = renderHook(() => useGenerateReport({ onSuccess: jest.fn() }));

      act(() => {
        result.current.setGenerateProjectId('1');
      });

      await act(async () => {
        await result.current.handleGenerate();
      });

      expect(result.current.error).toBe('Failed to generate report');
    });

    it('clears a previous error at the start of a new attempt', async () => {
      const { result } = renderHook(() => useGenerateReport({ onSuccess: jest.fn() }));

      // First attempt: no project selected, sets an error.
      await act(async () => {
        await result.current.handleGenerate();
      });
      expect(result.current.error).toBe('Select a project before generating a report');

      // Second attempt: now valid and successful, error should clear.
      mockPost.mockResolvedValueOnce({ ok: true });
      act(() => {
        result.current.setGenerateProjectId('1');
      });
      await act(async () => {
        await result.current.handleGenerate();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe('generating flag', () => {
    it('is true while the request is in flight and false once it settles', async () => {
      let resolvePost: (value: unknown) => void;
      mockPost.mockReturnValueOnce(
        new Promise((resolve) => {
          resolvePost = resolve;
        }),
      );
      const { result } = renderHook(() => useGenerateReport({ onSuccess: jest.fn() }));

      act(() => {
        result.current.setGenerateProjectId('1');
      });

      let generatePromise: Promise<void>;
      act(() => {
        generatePromise = result.current.handleGenerate();
      });

      await waitFor(() => expect(result.current.generating).toBe(true));

      await act(async () => {
        resolvePost!({ ok: true });
        await generatePromise;
      });

      expect(result.current.generating).toBe(false);
    });

    it('resets generating to false even when the request fails', async () => {
      mockPost.mockRejectedValueOnce(new Error('boom'));
      const { result } = renderHook(() => useGenerateReport({ onSuccess: jest.fn() }));

      act(() => {
        result.current.setGenerateProjectId('1');
      });

      await act(async () => {
        await result.current.handleGenerate();
      });

      expect(result.current.generating).toBe(false);
    });
  });
});