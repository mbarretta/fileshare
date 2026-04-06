'use client';

import { useState, useRef } from 'react';

interface UploadResult {
  url: string;
  token: string;
  expires_at: number | null;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadForm() {
  const [file, setFile] = useState<File | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [expireCount, setExpireCount] = useState<string>('');
  const [expireUnit, setExpireUnit] = useState<'h' | 'd'>('d');
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!file) return Promise.resolve();

    setLoading(true);
    setError(null);
    setResult(null);
    setCopied(false);
    setProgress(0);

    const formData = new FormData();
    formData.append('file', file);
    if (expireCount) {
      formData.append('expires_in', `${expireCount}${expireUnit}`);
    }

    return new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        try {
          const json = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            setResult(json as UploadResult);
            setFile(null);
            setFileSize(null);
            setExpireCount('');
            if (fileInputRef.current) fileInputRef.current.value = '';
          } else {
            setError((json as { error?: string }).error ?? `Upload failed (${xhr.status})`);
          }
        } catch {
          setError('Invalid server response');
        } finally {
          setLoading(false);
          setProgress(null);
          resolve();
        }
      };

      xhr.onerror = () => {
        setError('Network error');
        setLoading(false);
        setProgress(null);
        resolve();
      };

      xhr.onabort = () => {
        setError('Upload cancelled');
        setLoading(false);
        setProgress(null);
        resolve();
      };

      xhr.open('POST', '/api/upload');
      xhr.send(formData);
    });
  }

  async function copyToken() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  }

  const downloadUrl = result ? `${window.location.origin}${result.url}` : '';

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-zinc-200 p-8">
        <h1 className="text-2xl font-semibold text-zinc-900 mb-6 text-center">Upload a file</h1>

        {error && (
          <div
            role="alert"
            className="mb-5 rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        {result ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 space-y-3">
              <div>
                <p className="text-xs font-medium text-zinc-500 mb-1">Download URL</p>
                <a
                  href={downloadUrl}
                  className="block text-sm text-blue-600 hover:underline break-all"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {downloadUrl}
                </a>
              </div>

              <div>
                <p className="text-xs font-medium text-zinc-500 mb-1">Token</p>
                <p className="font-mono text-sm text-zinc-800 break-all">{result.token}</p>
              </div>

              {result.expires_at !== null && (
                <div>
                  <p className="text-xs font-medium text-zinc-500 mb-1">Expires</p>
                  <p className="text-sm text-zinc-700">
                    {new Date(result.expires_at * 1000).toLocaleString()}
                  </p>
                </div>
              )}
            </div>

            <div className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              ⚠ Save this token — it will not be shown again.
            </div>

            <button
              type="button"
              onClick={copyToken}
              className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2"
            >
              {copied ? 'Copied!' : 'Copy token'}
            </button>

            <button
              type="button"
              onClick={() => setResult(null)}
              className="w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              Upload another file
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label
                htmlFor="file"
                className="block text-sm font-medium text-zinc-700 mb-1"
              >
                File <span className="text-red-500">*</span>
              </label>
              <input
                id="file"
                ref={fileInputRef}
                type="file"
                required
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  setFileSize(f?.size ?? null);
                }}
                className="w-full text-sm text-zinc-700 file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-700 hover:file:bg-zinc-200"
              />
              {fileSize !== null && (
                <p className="text-xs text-zinc-500 mt-1">{formatBytes(fileSize)}</p>
              )}
            </div>

            {progress !== null && (
              <div className="w-full bg-zinc-100 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Expires in <span className="text-zinc-400 text-xs">(optional)</span>
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={expireCount}
                  onChange={(e) => setExpireCount(e.target.value)}
                  placeholder="No expiry"
                  className="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <select
                  value={expireUnit}
                  onChange={(e) => setExpireUnit(e.target.value as 'h' | 'd')}
                  className="rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="h">hours</option>
                  <option value="d">days</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !file}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              {loading ? 'Uploading…' : 'Upload'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
