declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        [key: string]: any;
      };
    }
    
    interface Router {
      cleanup?: () => void;
    }
  }
}

export {};