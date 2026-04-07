'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminGroupNew() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ slug: string; token: string } | null>(null);
  const [copied, setCopied] = useState(false);

  function deriveSlug(name: string): string {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 64);
  }

  function handleNameChange(value: string) {
    setName(value);
    if (!slugManual) {
      setSlug(deriveSlug(value));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to create group');
        return;
      }
      setResult({ slug: data.slug as string, token: data.token as string });
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmitting(false);
    }
  }

  function copyToken() {
    if (!result) return;
    navigator.clipboard.writeText(result.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (result) {
    return (
      <div className="space-y-5">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-5 space-y-4">
          <div>
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Group slug</p>
            <p className="font-mono text-sm text-zinc-900 dark:text-zinc-100">{result.slug}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Share link</p>
            <p className="font-mono text-sm text-blue-600 dark:text-blue-400 break-all">
              {typeof window !== 'undefined' ? `${window.location.origin}/g/${result.slug}` : `/g/${result.slug}`}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">Group token</p>
            <p className="font-mono text-sm text-zinc-800 dark:text-zinc-200 break-all">{result.token}</p>
          </div>
        </div>

        <div className="rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          ⚠ Save this token — it will not be shown again.
        </div>

        <button
          type="button"
          onClick={copyToken}
          className="w-full rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
        >
          {copied ? 'Copied!' : 'Copy token'}
        </button>

        <button
          type="button"
          onClick={() => router.push(`/admin/groups/${result.slug}`)}
          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
        >
          Manage group →
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div
          role="alert"
          className="rounded border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-700 dark:text-red-400"
        >
          {error}
        </div>
      )}

      <div>
        <label htmlFor="name" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          id="name"
          type="text"
          required
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          placeholder="Q1 2026 Deliverables"
          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-200 placeholder-zinc-400"
        />
      </div>

      <div>
        <label htmlFor="slug" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
          Slug <span className="text-red-500">*</span>
          <span className="text-zinc-400 font-normal ml-1">(URL: /g/slug)</span>
        </label>
        <input
          id="slug"
          type="text"
          required
          value={slug}
          onChange={(e) => { setSlug(e.target.value); setSlugManual(true); }}
          placeholder="q1-2026-deliverables"
          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-200 placeholder-zinc-400"
        />
        <p className="mt-1 text-xs text-zinc-400">Lowercase letters, numbers, hyphens — 1 to 64 characters.</p>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-zinc-900 dark:bg-zinc-100 px-4 py-2 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-300 disabled:opacity-50 transition-colors"
      >
        {submitting ? 'Creating…' : 'Create Group'}
      </button>
    </form>
  );
}
