import { prewarm } from '../src/warmup';

describe('prewarm', () => {
  const original = process.env.AWS_LAMBDA_FUNCTION_NAME;
  afterEach(() => {
    if (original === undefined) delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    else process.env.AWS_LAMBDA_FUNCTION_NAME = original;
  });

  it('does nothing outside Lambda', async () => {
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    const warm = jest.fn(async () => {});
    await prewarm(warm)();
    expect(warm).not.toHaveBeenCalled();
  });

  it('starts immediately in Lambda and runs once', async () => {
    process.env.AWS_LAMBDA_FUNCTION_NAME = 'branch-projects';
    const warm = jest.fn(async () => {});
    const run = prewarm(warm);
    expect(warm).toHaveBeenCalledTimes(1);
    await run();
    await run();
    expect(warm).toHaveBeenCalledTimes(1);
  });

  it('swallows a failure so health still answers', async () => {
    process.env.AWS_LAMBDA_FUNCTION_NAME = 'branch-projects';
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(prewarm(async () => Promise.reject(new Error('boom')))()).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
