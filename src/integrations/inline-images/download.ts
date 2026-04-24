// src/integrations/inline-images/download.ts
import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

import { TransientError } from '../../lib/errors';

export type SavedImage = {
  url: string;       // path served by our own HTTP, e.g. /images/foo.jpg
  filename: string;  // e.g. foo.jpg
};

function storageDir(): string {
  return process.env.STORAGE_DIR ?? path.resolve('storage');
}

export async function downloadBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'XeroGravity-ContentPipeline/1.0' },
  });
  if (!res.ok) throw new TransientError(`image download ${res.status}`);
  return await res.arrayBuffer();
}

export async function downloadAndSave(
  remoteUrl: string,
  filenameStem: string,
  width: number,
  height: number,
): Promise<SavedImage> {
  const buf = await downloadBytes(remoteUrl);
  const cropped = await sharp(Buffer.from(buf))
    .resize(width, height, { fit: 'cover', position: 'centre' })
    .jpeg({ quality: 85 })
    .toBuffer();

  const dir = path.join(storageDir(), 'images');
  await fs.mkdir(dir, { recursive: true });
  const filename = `${filenameStem}.jpg`;
  await fs.writeFile(path.join(dir, filename), cropped);

  return {
    url: `/images/${filename}`,
    filename,
  };
}
