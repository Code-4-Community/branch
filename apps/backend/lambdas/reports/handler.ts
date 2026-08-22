import { dispatch } from '@branch/lambda-http';
import { routes } from './routes';

export const handler = (event: any) => dispatch(event, { prefix: 'reports', routes });
