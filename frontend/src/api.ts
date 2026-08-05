import type { FlagInfo, RegionData, Scheme } from './types';

const API = '/api';

export async function parseYaml(file: File) {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API}/parse`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{
    count: number;
    by_type: Record<string, number>;
    source_path: string;
    source_hash: string;
  }>;
}

export async function buildScheme(): Promise<{ scheme: Scheme }> {
  const res = await fetch(`${API}/build`, { method: 'POST' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Reset server session to empty (as after app start). */
export async function clearSession(): Promise<void> {
  const res = await fetch(`${API}/session/clear`, { method: 'POST' });
  if (!res.ok) throw new Error(await res.text());
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

/** Import scheme JSON (from a local file picker) into the server session. */
export async function importScheme(scheme: Scheme): Promise<Scheme> {
  const res = await fetch(`${API}/scheme/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(scheme),
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json();
}

export async function fetchFlags(): Promise<FlagInfo[]> {
  const res = await fetch(`${API}/flags`);
  if (!res.ok) return [];
  return res.json();
}

export async function addCustomFlag(payload: {
  name: string;
  type: string;
  description: string;
}): Promise<FlagInfo> {
  const res = await fetch(`${API}/flags/custom`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json();
}

export async function deleteCustomFlag(name: string): Promise<{ affected_region_ids: string[] }> {
  const res = await fetch(`${API}/flags/custom/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json();
}

export async function deleteAllCustomFlags(): Promise<{
  deleted: string[];
  affected_region_ids: string[];
}> {
  const res = await fetch(`${API}/flags/custom`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json();
}

export async function exportCustomFlags(): Promise<string> {
  const res = await fetch(`${API}/flags/custom/export`);
  if (!res.ok) throw new Error(await readApiError(res));
  return res.text();
}

export async function importCustomFlags(file: File): Promise<{ count: number }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API}/flags/custom/import`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json();
}

async function readApiError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const parsed = JSON.parse(text) as { detail?: unknown };
    if (typeof parsed.detail === 'string') return parsed.detail;
  } catch {
    // keep raw text
  }
  return text || res.statusText;
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

export async function deleteManualRegion(
  id: string,
  childrenMode: 'detach' | 'cascade' = 'detach',
) {
  const res = await fetch(`${API}/regions/manual/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, children_mode: childrenMode }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateRegionFlags(
  regionId: string,
  flags: Record<string, unknown>,
) {
  const res = await fetch(`${API}/regions/${encodeURIComponent(regionId)}/flags`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ flags }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function updateRegionParent(
  regionId: string,
  parent: string | null,
) {
  const res = await fetch(`${API}/regions/${encodeURIComponent(regionId)}/parent`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parent }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function bulkUpdateFlags(payload: {
  flag: string;
  action: 'delete' | 'update';
  value?: unknown;
  region_ids?: string[] | null;
}) {
  const res = await fetch(`${API}/regions/flags/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{
    action: string;
    flag: string;
    updated: string[];
    count: number;
  }>;
}

export async function updateRegionGeometry(
  regionId: string,
  payload: {
    type: string;
    min?: { x: number; y: number; z: number };
    max?: { x: number; y: number; z: number };
    min_y?: number;
    max_y?: number;
    points?: { x: number; z: number }[];
  },
) {
  const res = await fetch(`${API}/regions/${encodeURIComponent(regionId)}/geometry`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await readApiError(res));
  return res.json();
}

export async function exportRegionsYaml(includeManual = true): Promise<string> {
  const qs = includeManual ? 'include_manual=true' : 'include_manual=false';
  const res = await fetch(`${API}/regions/export/yml?${qs}`, { method: 'GET' });
  if (!res.ok) throw new Error(await readApiError(res));
  return await res.text();
}
