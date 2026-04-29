// src/lib/paths.ts
import path from 'node:path';

export function storageDir(): string {
  return process.env.STORAGE_DIR ?? path.resolve('storage');
}

export function imagesDir(): string {
  return path.join(storageDir(), 'images');
}
