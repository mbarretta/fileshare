import crypto from 'crypto';
import { PassThrough, Readable } from 'stream';

export interface SHA256Result {
  sha256Promise: Promise<string>;
  sizePromise: Promise<number>;
  passThrough: PassThrough;
}

export function computeSHA256AndStream(source: Readable): SHA256Result {
  const passThrough = new PassThrough();
  const hash = crypto.createHash('sha256');
  let size = 0;

  const sha256Promise = new Promise<string>((resolve, reject) => {
    passThrough.on('data', (chunk: Buffer) => {
      hash.update(chunk);
      size += chunk.length;
    });
    passThrough.on('end', () => resolve(hash.digest('hex')));
    passThrough.on('error', reject);
  });

  const sizePromise = sha256Promise.then(() => size);

  source.pipe(passThrough);

  return { sha256Promise, sizePromise, passThrough };
}
