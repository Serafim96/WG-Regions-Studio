import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildScheme,
  clearManualRegions,
  clearSession,
  exportRegionsYaml,
  importScheme,
  parseYaml,
} from '../api';
import type { Scheme } from '../types';
import type { FlagConflictsResult } from '../utils/flagConflicts';
import { findOrphanRegionIds } from '../utils/graph';
import { isSchemeFileName, isUserCancelled, isYamlFileName, openSchemeOrYamlWithDialog, saveTextWithDialog } from '../utils/fileDialog';
import { validateSchemeForYamlExport } from '../utils/schemeValidation';
import { clearViewState } from '../utils/viewState';
import { useI18n } from '../i18n/I18nContext';

export type ExportGate = {
  refreshExportErrors: () => void;
  showExportBlockedFlash: (errorCount: number) => void;
};

/**
 * Load / apply / clear scheme, open/save/export YAML, reset manuals, clear session.
 */
export function useSchemeSession(deps: {
  getCollapseThreshold: () => number;
  /** Called when a fresh scheme is applied (default collapse + highlight/notification reset). */
  onFreshScheme: (next: Scheme, threshold: number) => void;
  clearCameraRequests: () => void;
  onClearAppExtras: () => void;
  schemeKeyRef: React.MutableRefObject<string>;
  isFreshSchemeRef: React.MutableRefObject<boolean>;
  exportGateRef: React.MutableRefObject<ExportGate>;
}) {
  const { t, locale } = useI18n();
  const {
    getCollapseThreshold,
    clearCameraRequests,
    onClearAppExtras,
    schemeKeyRef,
    isFreshSchemeRef,
    exportGateRef,
  } = deps;

  const onFreshSchemeRef = useRef(deps.onFreshScheme);
  onFreshSchemeRef.current = deps.onFreshScheme;
  const getCollapseThresholdRef = useRef(getCollapseThreshold);
  getCollapseThresholdRef.current = getCollapseThreshold;

  const [scheme, setScheme] = useState<Scheme | null>(null);
  const [status, setStatus] = useState('');
  const [orphanIds, setOrphanIds] = useState<Set<string>>(new Set());
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showOpenFileConfirm, setShowOpenFileConfirm] = useState(false);
  const [showExportManualConfirm, setShowExportManualConfirm] = useState(false);
  const [validationDialog, setValidationDialog] = useState<{
    title: string;
    intro?: string;
    issues: import('../utils/schemeValidation').SchemeIssue[];
    okMessage?: string;
  } | null>(null);

  /** Latest conflicts for export validation (set by App each render). */
  const flagConflictsRef = useRef<FlagConflictsResult | null>(null);
  const setFlagConflicts = useCallback((value: FlagConflictsResult | null) => {
    flagConflictsRef.current = value;
  }, []);

  useEffect(() => {
    if (!scheme) setStatus(t('status.loadYaml'));
  }, [locale, t, scheme]);

  const applyOrphans = useCallback((next: Scheme) => {
    const orphans = findOrphanRegionIds(next.regions);
    setOrphanIds(new Set(orphans));
  }, []);

  const applyScheme = useCallback((
    next: Scheme,
    fresh: boolean,
    threshold: number,
  ) => {
    isFreshSchemeRef.current = fresh;
    applyOrphans(next);
    if (fresh) {
      onFreshSchemeRef.current(next, threshold);
      setScheme(next);
      return;
    }
    setScheme(next);
  }, [applyOrphans, isFreshSchemeRef]);

  const runBusy = useCallback(async (message: string, fn: () => Promise<void>) => {
    setBusyMessage(message);
    try {
      await fn();
    } finally {
      setBusyMessage(null);
    }
  }, []);

  const formatValidation = useCallback(() => ({
    invalidId: (id: string) => t('validate.invalidId', { id }),
    hardError: (msg: string) => t('validate.hardError', { msg }),
    ambiguous: (flag: string, a: string, b: string) => t('validate.ambiguous', { flag, a, b }),
    incompleteManual: (id: string) => t('validate.incompleteManual', { id }),
  }), [t]);

  /** UI back to post-launch empty canvas (after server session is already empty). */
  const applyLaunchEmptyState = useCallback((statusMessage: string) => {
    clearViewState(schemeKeyRef.current);
    schemeKeyRef.current = 'default';
    isFreshSchemeRef.current = false;
    setScheme(null);
    setOrphanIds(new Set());
    setShowClearConfirm(false);
    setShowResetConfirm(false);
    onClearAppExtras();
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    }
    setStatus(statusMessage);
  }, [onClearAppExtras, schemeKeyRef, isFreshSchemeRef]);

  const handleClearApp = useCallback(async () => {
    try {
      await runBusy(t('status.resetting'), async () => {
        await clearSession();
      });
    } catch (err) {
      setStatus(t('status.error', { msg: String(err) }));
      return;
    }
    applyLaunchEmptyState(t('status.appCleared'));
  }, [runBusy, t, applyLaunchEmptyState]);

  /** Last region removed (or manuals-only reset emptied the session). */
  const returnToLaunchAfterEmpty = useCallback(async () => {
    try {
      await runBusy(t('status.resetting'), async () => {
        await clearSession();
      });
    } catch (err) {
      setStatus(t('status.error', { msg: String(err) }));
    }
    applyLaunchEmptyState(t('status.loadYaml'));
  }, [runBusy, t, applyLaunchEmptyState]);

  const showOpenFileError = useCallback((message: string) => {
    setStatus(t('status.error', { msg: message }));
    setValidationDialog({
      title: t('status.openFileErrorTitle'),
      intro: t('status.openFileErrorIntro'),
      issues: [{ severity: 'error', code: 'hardError', text: message }],
    });
  }, [t]);

  const performOpenFile = useCallback(async () => {
    try {
      const picked = await openSchemeOrYamlWithDialog();
      if (!picked) return;

      if (isYamlFileName(picked.name)) {
        try {
          await runBusy(t('status.building'), async () => {
            await parseYaml(picked.file);
            clearCameraRequests();
            const result = await buildScheme();
            applyScheme(result.scheme, true, getCollapseThresholdRef.current());
            setStatus(t('status.schemeReady'));
          });
        } catch (err) {
          showOpenFileError(t('status.yamlInvalid', { msg: String(err) }));
        }
        return;
      }

      if (!isSchemeFileName(picked.name)) {
        showOpenFileError(t('status.unsupportedFile', { name: picked.name }));
        return;
      }

      let parsed: Scheme;
      try {
        parsed = JSON.parse(picked.text) as Scheme;
      } catch {
        showOpenFileError(t('status.schemeInvalidJson'));
        return;
      }

      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.regions)) {
        showOpenFileError(t('status.schemeInvalidContent'));
        return;
      }

      try {
        await runBusy(t('status.building'), async () => {
          clearCameraRequests();
          const loaded = await importScheme(parsed);
          applyScheme(loaded, true, getCollapseThresholdRef.current());
          setStatus(t('status.schemeLoaded'));
        });
      } catch (err) {
        showOpenFileError(t('status.schemeInvalidContentDetail', { msg: String(err) }));
      }
    } catch (err) {
      if (isUserCancelled(err)) return;
      showOpenFileError(String(err));
    }
  }, [
    runBusy,
    t,
    clearCameraRequests,
    applyScheme,
    showOpenFileError,
  ]);

  const handleOpenFileClick = useCallback(() => {
    if (scheme) {
      setShowOpenFileConfirm(true);
      return;
    }
    void performOpenFile();
  }, [scheme, performOpenFile]);

  const handleConfirmOpenFile = useCallback(async () => {
    setShowOpenFileConfirm(false);
    await performOpenFile();
  }, [performOpenFile]);

  const handleConfirmResetScheme = useCallback(async () => {
    setShowResetConfirm(false);
    try {
      let emptied = false;
      await runBusy(t('status.resetting'), async () => {
        setStatus(t('status.clearingManuals'));
        const cleared = await clearManualRegions();
        clearCameraRequests();
        if (cleared.remaining === 0) {
          await clearSession();
          emptied = true;
          return;
        }
        const result = await buildScheme();
        applyScheme(result.scheme, true, getCollapseThresholdRef.current());
        setStatus(t('status.schemeReady'));
      });
      if (emptied) {
        applyLaunchEmptyState(t('status.loadYaml'));
      }
    } catch (err) {
      setStatus(t('status.error', { msg: String(err) }));
    }
  }, [runBusy, t, clearCameraRequests, applyScheme, applyLaunchEmptyState]);

  const handleSaveScheme = useCallback(async () => {
    if (!scheme) return;
    try {
      const text = JSON.stringify(scheme, null, 2);
      const name = await saveTextWithDialog(text, 'scheme.mrv.json');
      setStatus(t('status.schemeSaved', { path: name }));
    } catch (err) {
      if (isUserCancelled(err)) return;
      setStatus(t('status.error', { msg: String(err) }));
    }
  }, [scheme, t]);

  const blockExportIfErrors = useCallback((includeManual: boolean): boolean => {
    const conflicts = flagConflictsRef.current;
    if (!scheme || !conflicts) return true;

    exportGateRef.current.refreshExportErrors();

    const result = validateSchemeForYamlExport(
      scheme,
      conflicts,
      { includeManual },
      formatValidation(),
    );
    if (result.errors.length > 0) {
      exportGateRef.current.showExportBlockedFlash(result.errors.length);
      return true;
    }
    return false;
  }, [scheme, formatValidation, exportGateRef]);

  const doExportRegionsYaml = useCallback(async (includeManual: boolean) => {
    const conflicts = flagConflictsRef.current;
    if (!scheme || !conflicts) return;

    if (blockExportIfErrors(includeManual)) return;

    try {
      const yamlText = await exportRegionsYaml(includeManual);
      const blob = new Blob([yamlText], { type: 'text/yaml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'regions.export.yml';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      if (conflicts.warningSummary.totalCount > 0) {
        setStatus(
          t('status.exportedWithConflicts', {
            ambiguous: conflicts.warningSummary.spatialAmbiguousCount,
          }),
        );
      } else {
        setStatus(t('status.exported'));
      }
    } catch (err) {
      setStatus(t('status.error', { msg: String(err) }));
    }
  }, [scheme, t, blockExportIfErrors]);

  const handleExportRegionsYaml = useCallback(() => {
    const conflicts = flagConflictsRef.current;
    if (!scheme || !conflicts) return;
    if (blockExportIfErrors(false)) return;
    setShowExportManualConfirm(true);
  }, [scheme, blockExportIfErrors]);

  return {
    scheme,
    setScheme,
    status,
    setStatus,
    orphanIds,
    setOrphanIds,
    applyOrphans,
    applyScheme,
    busyMessage,
    runBusy,
    showClearConfirm,
    setShowClearConfirm,
    showResetConfirm,
    setShowResetConfirm,
    showOpenFileConfirm,
    setShowOpenFileConfirm,
    showExportManualConfirm,
    setShowExportManualConfirm,
    validationDialog,
    setValidationDialog,
    handleClearApp,
    applyLaunchEmptyState,
    returnToLaunchAfterEmpty,
    handleOpenFileClick,
    handleConfirmOpenFile,
    handleConfirmResetScheme,
    handleSaveScheme,
    doExportRegionsYaml,
    handleExportRegionsYaml,
    setFlagConflicts,
  };
}
