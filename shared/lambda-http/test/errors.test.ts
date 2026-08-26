import { reportError, serverError } from '../src/errors';

jest.mock('@sentry/aws-serverless', () => ({ captureException: jest.fn() }), {
  virtual: true,
});

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Sentry = require('@sentry/aws-serverless') as { captureException: jest.Mock };

describe('reportError', () => {
  beforeEach(() => Sentry.captureException.mockClear());

  it('hands the error to the layer SDK', () => {
    const err = new Error('boom');
    reportError(err);
    expect(Sentry.captureException).toHaveBeenCalledWith(err, undefined);
  });

  it('attaches context as Sentry extras', () => {
    const err = new Error('boom');
    reportError(err, { method: 'GET', path: '/projects' });
    expect(Sentry.captureException).toHaveBeenCalledWith(err, {
      extra: { method: 'GET', path: '/projects' },
    });
  });

  it('stays silent when the SDK itself throws', () => {
    Sentry.captureException.mockImplementationOnce(() => {
      throw new Error('sentry is down');
    });
    expect(() => reportError(new Error('boom'))).not.toThrow();
  });
});

describe('serverError', () => {
  let logged: jest.SpyInstance;

  beforeEach(() => {
    Sentry.captureException.mockClear();
    logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => logged.mockRestore());

  it('returns a 500 and reports the error without leaking it', () => {
    const err = new Error('secret detail');
    const res = serverError(err, 'Failed to create donor');

    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body)).toEqual({ message: 'Failed to create donor' });
    expect(res.body).not.toContain('secret detail');
    expect(Sentry.captureException).toHaveBeenCalledWith(err, undefined);
    expect(logged).toHaveBeenCalled();
  });

  it('merges extra body fields for routes that return more than a message', () => {
    const res = serverError(new Error('boom'), 'MFA request failed', {
      error: 'NotAuthorizedException',
      code: 'NotAuthorizedException',
    });

    expect(JSON.parse(res.body)).toEqual({
      message: 'MFA request failed',
      error: 'NotAuthorizedException',
      code: 'NotAuthorizedException',
    });
  });
});
