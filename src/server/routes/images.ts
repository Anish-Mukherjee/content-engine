// src/server/routes/images.ts
import express, { Router } from 'express';
import path from 'node:path';

export const imagesRouter = Router();

const storageDir = () => process.env.STORAGE_DIR ?? path.resolve('storage');

imagesRouter.use(
  '/images',
  express.static(path.join(storageDir(), 'images'), {
    maxAge: '7d',
    immutable: true,
    fallthrough: false,
  }),
);
