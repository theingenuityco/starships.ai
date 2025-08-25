import { User } from '@starships/models';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      kindeId?: string;
    }
  }
}