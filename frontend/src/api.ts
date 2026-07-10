import type { FlagInfo, RegionData, Scheme } from './types';

const API = '/api';

export async function parseYaml(file: File) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API}/parse`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ count: number; by_type: Record<string, number>; source_path: string }>;
}

export async function buildScheme(): Promise<{ scheme: Scheme }> {
  const res = await fetch(`${API}/build`, { method: 'POST' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getScheme(): Promise<Scheme> {
  const res = await fetch(`${API}/scheme`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function saveScheme(path: string) {
  const res = await fetch(`${API}/scheme/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function loadScheme(path: string): Promise<Scheme> {
  const res = await fetch(`${API}/scheme/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchFlags(): Promise<FlagInfo[]> {
  const res = await fetch(`${API}/flags`);
  if (!res.ok) return [];
  return res.json();
}

export async function addManualRegion(data: Partial<RegionData> & { id: string }) {
  const res = await fetch(`${API}/regions/manual`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
