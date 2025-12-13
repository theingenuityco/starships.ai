import { UserModel } from '@starships/protocol';

declare global {
  namespace Express {
    interface Request {
      user?: UserModel;
      authContext?: {
        userId: string;
        agentId?: string;
        starshipId?: string;
      };
    }
  }
}
