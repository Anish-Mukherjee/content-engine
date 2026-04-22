// src/server/routes/admin.ts
import { Router, type NextFunction, type Request, type Response } from 'express';

export const adminRouter = Router();

function requireAdminKey(req: Request, res: Response, next: NextFunction) {
  const key = req.header('x-admin-key');
  if (!key || key !== process.env.ADMIN_API_KEY) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
}

adminRouter.use('/api/admin', requireAdminKey);

const STUBS = [
  { method: 'get',  path: '/api/admin/articles' },
  { method: 'get',  path: '/api/admin/articles/:id' },
  { method: 'post', path: '/api/admin/articles/:id/retry' },
  { method: 'post', path: '/api/admin/articles/:id/unpublish' },
  { method: 'post', path: '/api/admin/trigger/:stage' },
  { method: 'get',  path: '/api/admin/pipeline/status' },
  { method: 'get',  path: '/api/admin/keyword-results' },
] as const;

for (const stub of STUBS) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (adminRouter as any)[stub.method](stub.path, (_req: Request, res: Response) => {
    res.status(501).json({ stub: true, not_yet_implemented: true, endpoint: stub.path });
  });
}
