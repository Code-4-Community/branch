import { dispatch, prewarm } from '@branch/lambda-http';
import { onImpersonatedWrite, resolveAuth, warmup } from './auth';
import { routes } from './routes';

// Module scope, so it starts during init rather than on the first request.
const warm = prewarm(warmup);

export const handler = (event: any) =>
  dispatch(event, { prefix: 'expenditures', routes, resolveAuth, onImpersonatedWrite, warmup: warm });
