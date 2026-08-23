import { dispatch } from '@branch/lambda-http';
import { resolveAuth } from './auth';
import { routes } from './routes';

export const handler = (event: any) =>
  dispatch(event, { prefix: 'expenditures', routes, resolveAuth });
