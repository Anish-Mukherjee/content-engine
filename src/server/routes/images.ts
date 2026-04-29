// src/server/routes/images.ts
import express, { Router } from 'express';

import { imagesDir } from '../../lib/paths';

export const imagesRouter = Router();

imagesRouter.use(
  '/images',
  express.static(imagesDir(), {
    maxAge: '7d',
    immutable: true,
    fallthrough: false,
  }),
);
