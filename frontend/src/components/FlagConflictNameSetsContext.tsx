import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { SpatialConflict } from '../utils/flagConflicts';
import { spatialConflictFlagNameSets } from '../utils/flagConflictLookup';

const EMPTY_WARNING = new Set<string>();
const EMPTY_UNDEFINED = new Set<string>();

interface FlagConflictNameSetsValue {
  warningNames: ReadonlySet<string>;
  undefinedNames: ReadonlySet<string>;
}

const FlagConflictNameSetsContext = createContext<FlagConflictNameSetsValue | null>(null);

export function FlagConflictNameSetsProvider({
  spatialConflicts,
  children,
}: {
  spatialConflicts: SpatialConflict[];
  children: ReactNode;
}) {
  const value = useMemo(
    () => spatialConflictFlagNameSets(spatialConflicts),
    [spatialConflicts],
  );
  return (
    <FlagConflictNameSetsContext.Provider value={value}>
      {children}
    </FlagConflictNameSetsContext.Provider>
  );
}

export function useFlagConflictNameSets(): FlagConflictNameSetsValue {
  const ctx = useContext(FlagConflictNameSetsContext);
  if (!ctx) {
    return { warningNames: EMPTY_WARNING, undefinedNames: EMPTY_UNDEFINED };
  }
  return ctx;
}
