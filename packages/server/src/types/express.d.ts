/**
 * Global type augmentation for Express Request interface
 * This extends the Express Request type to include user authentication properties
 */
declare namespace Express {
  interface Request {
    user?: any;
    kindeId?: string;
  }
}