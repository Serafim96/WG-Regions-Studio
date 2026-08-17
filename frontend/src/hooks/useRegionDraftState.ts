import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FlagInfo, RegionData } from '../types';
import { compareNatural } from '../utils/naturalSort';
import { validateFlagRows } from '../utils/flagRows';
import {
  geometryFromRegion,
  type GeometryPayload,
  type RegionGeometryState,
  validateGeometryState,
} from '../components/RegionGeometryEditor';
import { useI18n } from '../i18n/I18nContext';

export interface FlagRow {
  key: string;
  name: string;
  value: string;
}

function formatFlagValue(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function parseFlagValue(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === '') return '';
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return raw;
  }
}

export function flagsToRows(flags: Record<string, unknown>): FlagRow[] {
  return Object.entries(flags).map(([name, value], index) => ({
    key: `${name}-${index}`,
    name,
    value: formatFlagValue(value),
  }));
}

export function rowsToFlags(rows: FlagRow[]): Record<string, unknown> {
  const flags: Record<string, unknown> = {};
  for (const row of rows) {
    const name = row.name.trim();
    if (!name) continue;
    flags[name] = parseFlagValue(row.value);
  }
  return flags;
}

export function stringListFromParty(party: Record<string, unknown> | undefined, key: string): string[] {
  const raw = party?.[key];
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => String(v));
}

export function partyFromRegion(party: Record<string, unknown> | undefined): {
  players: string[];
  uniqueIds: string[];
} {
  return {
    players: stringListFromParty(party, 'players'),
    uniqueIds: stringListFromParty(party, 'uniqueIds'),
  };
}

export function partyToRecord(
  players: string[],
  uniqueIds: string[],
  previous: Record<string, unknown> | undefined,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...(previous ?? {}) };
  next.players = players;
  next.uniqueIds = uniqueIds;
  return next;
}

type DraftDeps = {
  region: RegionData;
  childIds: string[];
  regionIds: string[];
  flagsCatalog: FlagInfo[];
  onUpdateParent?: (regionId: string, parent: string | null) => Promise<void>;
  onUpdateFlags?: (regionId: string, flags: Record<string, unknown>) => Promise<void>;
  onUpdateGeometry?: (regionId: string, payload: GeometryPayload) => Promise<void>;
  onUpdatePriority?: (regionId: string, priority: number) => Promise<void>;
  onUpdateMembers?: (
    regionId: string,
    owners: Record<string, unknown>,
    members: Record<string, unknown>,
  ) => Promise<void>;
  /** Wrap saveAll as one history entry (region panel batch save). */
  runSaveBatch?: (fn: () => Promise<void>) => Promise<void>;
};

/**
 * Draft parent/priority/geometry/flags/members, reset on region change, dirty, saveAll.
 */
export function useRegionDraftState(deps: DraftDeps) {
  const { t } = useI18n();
  const {
    region,
    childIds,
    regionIds,
    flagsCatalog,
    onUpdateParent,
    onUpdateFlags,
    onUpdateGeometry,
    onUpdatePriority,
    onUpdateMembers,
    runSaveBatch,
  } = deps;

  const [fieldsLocked, setFieldsLocked] = useState(true);
  const [editingParent, setEditingParent] = useState(false);
  const [parentQuery, setParentQuery] = useState(region.parent ?? '');
  const [parentError, setParentError] = useState<string | null>(null);

  const [geometry, setGeometry] = useState<RegionGeometryState>(() => geometryFromRegion(region));
  const [geometryError, setGeometryError] = useState<string | null>(null);
  const [geometryDirty, setGeometryDirty] = useState(false);

  const [flagRows, setFlagRows] = useState<FlagRow[]>(() => flagsToRows(region.flags ?? {}));
  const [flagsDirty, setFlagsDirty] = useState(false);
  const [flagsError, setFlagsError] = useState<string | null>(null);

  const [priorityDraft, setPriorityDraft] = useState(String(region.priority));
  const [priorityError, setPriorityError] = useState<string | null>(null);

  const [ownersPlayers, setOwnersPlayers] = useState(() => partyFromRegion(region.owners).players);
  const [ownersUniqueIds, setOwnersUniqueIds] = useState(() => partyFromRegion(region.owners).uniqueIds);
  const [membersPlayers, setMembersPlayers] = useState(() => partyFromRegion(region.members).players);
  const [membersUniqueIds, setMembersUniqueIds] = useState(() => partyFromRegion(region.members).uniqueIds);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [membersDirty, setMembersDirty] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);

  const resetDraftsFromRegion = useCallback((source: RegionData) => {
    setGeometry(geometryFromRegion(source));
    setGeometryDirty(false);
    setGeometryError(null);
    setFlagRows(flagsToRows(source.flags ?? {}));
    setFlagsDirty(false);
    setFlagsError(null);
    setParentQuery(source.parent ?? '');
    setParentError(null);
    setEditingParent(false);
    setPriorityDraft(String(source.priority));
    setPriorityError(null);
    const owners = partyFromRegion(source.owners);
    const members = partyFromRegion(source.members);
    setOwnersPlayers(owners.players);
    setOwnersUniqueIds(owners.uniqueIds);
    setMembersPlayers(members.players);
    setMembersUniqueIds(members.uniqueIds);
    setMembersDirty(false);
    setMembersError(null);
  }, []);

  useEffect(() => {
    resetDraftsFromRegion(region);
    setFieldsLocked(true);
  }, [region, resetDraftsFromRegion]);

  const parentCandidates = useMemo(() => {
    const q = parentQuery.trim().toLowerCase();
    const excluded = new Set([region.id, ...childIds]);
    return regionIds
      .filter((id) => !excluded.has(id))
      .filter((id) => !q || id.toLowerCase().includes(q))
      .sort(compareNatural)
      .slice(0, 40);
  }, [parentQuery, regionIds, region.id, childIds]);

  const resolvedParent = useMemo(() => {
    const q = parentQuery.trim();
    if (!q) return null;
    return regionIds.find((id) => id.toLowerCase() === q.toLowerCase() && id !== region.id) ?? undefined;
  }, [parentQuery, regionIds, region.id]);

  const parentDirty = useMemo(() => {
    if (!onUpdateParent) return false;
    const draft = parentQuery.trim() || null;
    const current = region.parent ?? null;
    if (draft === null && current === null) return false;
    if (draft === null || current === null) return true;
    return draft.toLowerCase() !== current.toLowerCase();
  }, [onUpdateParent, parentQuery, region.parent]);

  const priorityDirty =
    Boolean(onUpdatePriority) && priorityDraft.trim() !== String(region.priority);

  const isDirty =
    geometryDirty
    || flagsDirty
    || parentDirty
    || priorityDirty
    || membersDirty;

  const fieldsEditable = !fieldsLocked && !saveBusy;

  const onGeometryChange = (next: RegionGeometryState) => {
    setGeometry(next);
    setGeometryDirty(true);
    setGeometryError(null);
  };

  const updateFlagRow = (key: string, patch: Partial<Pick<FlagRow, 'name' | 'value'>>) => {
    setFlagRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
    setFlagsDirty(true);
  };

  const removeFlagRow = (key: string) => {
    setFlagRows((prev) => prev.filter((row) => row.key !== key));
    setFlagsDirty(true);
  };

  const addFlagRow = () => {
    setFlagRows((prev) => [
      ...prev,
      { key: `new-${Date.now()}-${prev.length}`, name: '', value: '' },
    ]);
    setFlagsDirty(true);
  };

  const clearAllFlagRows = () => {
    if (flagRows.length === 0) return;
    setFlagRows([]);
    setFlagsDirty(true);
    setFlagsError(null);
  };

  const markMembersDirty = () => setMembersDirty(true);

  const discardChanges = () => {
    resetDraftsFromRegion(region);
    setFieldsLocked(true);
  };

  const executeSaveAll = async () => {
    if (!isDirty || saveBusy) return;

    setParentError(null);
    setPriorityError(null);
    setGeometryError(null);
    setFlagsError(null);
    setMembersError(null);

    if (parentDirty) {
      if (parentQuery.trim() !== '' && resolvedParent === undefined) {
        setParentError(t('region.parentInvalid'));
        return;
      }
    }

    let priorityValue: number | null = null;
    if (priorityDirty) {
      const parsed = Number(priorityDraft.trim());
      if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
        setPriorityError(t('geometry.invalidNumber'));
        return;
      }
      priorityValue = parsed;
    }

    let geometryPayload: GeometryPayload | null = null;
    if (geometryDirty && onUpdateGeometry) {
      const validated = validateGeometryState(geometry);
      if (!validated.ok) {
        setGeometryError(t(validated.errorKey));
        return;
      }
      geometryPayload = validated.payload;
    }

    if (flagsDirty && onUpdateFlags) {
      const flagCheck = validateFlagRows(flagRows, flagsCatalog);
      if (!flagCheck.ok) {
        setFlagsError(t(flagCheck.errorKey));
        return;
      }
    }

    setSaveBusy(true);
    try {
      if (parentDirty && onUpdateParent) {
        await onUpdateParent(region.id, parentQuery.trim() ? resolvedParent! : null);
      }
      if (priorityDirty && onUpdatePriority && priorityValue != null) {
        await onUpdatePriority(region.id, priorityValue);
      }
      if (geometryPayload && onUpdateGeometry) {
        await onUpdateGeometry(region.id, geometryPayload);
        setGeometryDirty(false);
      }
      if (flagsDirty && onUpdateFlags) {
        await onUpdateFlags(region.id, rowsToFlags(flagRows));
        setFlagsDirty(false);
      }
      if (membersDirty && onUpdateMembers) {
        await onUpdateMembers(
          region.id,
          partyToRecord(ownersPlayers, ownersUniqueIds, region.owners),
          partyToRecord(membersPlayers, membersUniqueIds, region.members),
        );
        setMembersDirty(false);
      }
      setFieldsLocked(true);
    } catch (err) {
      const message = String(err);
      if (parentDirty) setParentError(message);
      else if (priorityDirty) setPriorityError(message);
      else if (geometryDirty) setGeometryError(message);
      else if (flagsDirty) setFlagsError(message);
      else setMembersError(message);
    } finally {
      setSaveBusy(false);
    }
  };

  const saveAll = async () => {
    if (!isDirty) return;
    if (runSaveBatch) {
      await runSaveBatch(executeSaveAll);
      return;
    }
    await executeSaveAll();
  };

  return {
    fieldsLocked,
    setFieldsLocked,
    editingParent,
    setEditingParent,
    parentQuery,
    setParentQuery,
    parentError,
    setParentError,
    geometry,
    geometryError,
    geometryDirty,
    flagRows,
    flagsDirty,
    flagsError,
    setFlagsError,
    priorityDraft,
    setPriorityDraft,
    priorityError,
    setPriorityError,
    ownersPlayers,
    setOwnersPlayers,
    ownersUniqueIds,
    setOwnersUniqueIds,
    membersPlayers,
    setMembersPlayers,
    membersUniqueIds,
    setMembersUniqueIds,
    membersError,
    membersDirty,
    saveBusy,
    parentCandidates,
    resolvedParent,
    parentDirty,
    priorityDirty,
    isDirty,
    fieldsEditable,
    onGeometryChange,
    updateFlagRow,
    removeFlagRow,
    addFlagRow,
    clearAllFlagRows,
    markMembersDirty,
    discardChanges,
    saveAll,
  };
}
