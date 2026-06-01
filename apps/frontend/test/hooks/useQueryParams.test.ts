import { renderHook, act } from '@testing-library/react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useQueryParams } from '@/hooks/useQueryParams';

// next/navigation is globally mocked in jest.setup.ts
const mockReplace = jest.fn();
const mockSearchParams = (init?: string) =>
  jest.mocked(useSearchParams).mockReturnValue(new URLSearchParams(init) as ReturnType<typeof useSearchParams>);

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(useRouter).mockReturnValue({
    replace: mockReplace,
    push: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
  });
  jest.mocked(usePathname).mockReturnValue('/expenses');
  mockSearchParams();
});

const defaults = {
  q: '',
  months: [] as string[],
  sort: '',
  page: '',
};

describe('useQueryParams — initial values', () => {
  test('returns defaults when URL has no params', () => {
    const { result } = renderHook(() => useQueryParams(defaults));
    expect(result.current[0]).toEqual(defaults);
  });

  test('reads a string param from the URL', () => {
    mockSearchParams('q=travel');
    const { result } = renderHook(() => useQueryParams(defaults));
    expect(result.current[0].q).toBe('travel');
  });

  test('reads an array param from a comma-separated URL value', () => {
    mockSearchParams('months=January%2CFebruary');
    const { result } = renderHook(() => useQueryParams(defaults));
    expect(result.current[0].months).toEqual(['January', 'February']);
  });

  test('returns empty array for an array param with empty string value', () => {
    mockSearchParams('months=');
    const { result } = renderHook(() => useQueryParams(defaults));
    expect(result.current[0].months).toEqual([]);
  });

  test('falls back to default for unrecognised keys', () => {
    mockSearchParams('unknown=foo');
    const { result } = renderHook(() => useQueryParams(defaults));
    expect(result.current[0]).toEqual(defaults);
  });
});

describe('useQueryParams — setParams', () => {
  test('calls router.replace with updated string param', () => {
    const { result } = renderHook(() => useQueryParams(defaults));
    act(() => { result.current[1]({ q: 'food' }); });
    expect(mockReplace).toHaveBeenCalledWith('/expenses?q=food');
  });

  test('calls router.replace with comma-separated array param', () => {
    const { result } = renderHook(() => useQueryParams(defaults));
    act(() => { result.current[1]({ months: ['January', 'March'] }); });
    expect(mockReplace).toHaveBeenCalledWith('/expenses?months=January%2CMarch');
  });

  test('removes param from URL when string is set to empty', () => {
    mockSearchParams('q=food');
    const { result } = renderHook(() => useQueryParams(defaults));
    act(() => { result.current[1]({ q: '' }); });
    expect(mockReplace).toHaveBeenCalledWith('/expenses?');
  });

  test('removes param from URL when array is set to empty', () => {
    mockSearchParams('months=January');
    const { result } = renderHook(() => useQueryParams(defaults));
    act(() => { result.current[1]({ months: [] }); });
    expect(mockReplace).toHaveBeenCalledWith('/expenses?');
  });

  test('preserves existing params when updating one key', () => {
    mockSearchParams('q=food&sort=Amount');
    const { result } = renderHook(() => useQueryParams(defaults));
    act(() => { result.current[1]({ q: 'travel' }); });
    const url = mockReplace.mock.calls[0][0] as string;
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('q')).toBe('travel');
    expect(params.get('sort')).toBe('Amount');
  });

  test('handles multiple updates in a single call', () => {
    const { result } = renderHook(() => useQueryParams(defaults));
    act(() => { result.current[1]({ q: 'food', months: ['June'], page: '' }); });
    const url = mockReplace.mock.calls[0][0] as string;
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('q')).toBe('food');
    expect(params.get('months')).toBe('June');
    expect(params.has('page')).toBe(false);
  });

  test('page reset pattern: clears page when filter changes', () => {
    mockSearchParams('q=old&page=3');
    const { result } = renderHook(() => useQueryParams(defaults));
    act(() => { result.current[1]({ q: 'new', page: '' }); });
    const url = mockReplace.mock.calls[0][0] as string;
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('q')).toBe('new');
    expect(params.has('page')).toBe(false);
  });

  test('uses router.replace not push (no history entry)', () => {
    const mockPush = jest.fn();
    jest.mocked(useRouter).mockReturnValue({ replace: mockReplace, push: mockPush, prefetch: jest.fn(), back: jest.fn(), forward: jest.fn(), refresh: jest.fn() });
    const { result } = renderHook(() => useQueryParams(defaults));
    act(() => { result.current[1]({ q: 'test' }); });
    expect(mockReplace).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
