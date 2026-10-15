import { dispatch } from '@branch/lambda-http';
import { onImpersonatedWrite, resolveAuth } from './auth';
import { routes } from './routes';

export const handler = (event: any) =>
  dispatch(event, { prefix: 'projects', routes, resolveAuth, onImpersonatedWrite });
