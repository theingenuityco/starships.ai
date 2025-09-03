import { UserModel } from '@starships/protocol';

declare global {
  namespace Express {
    interface Request {
      user?: UserModel;
    }
  }
}