import { stackingKey } from './stackings';
import type { Stacking } from './types';
import { markerIsWellFormed } from './project-state';

export type GaussianRrm = 50 | 60 | 70 | 80 | 90 | 95;
export type GaussianClassRow = (
  | { key: string; rrm: 50 | 60 | 70 | 80 }
  | { key: string; rrm: 90 | 95; tilt30: boolean; disp45: boolean }
) & { excluded?: boolean };

export interface GaussianClassMarker {
  schema: 1;
  basis: string[];
  active: boolean;
  rows: GaussianClassRow[];
}

export interface AutomaticGaussianPrefilters {
  tilt30: boolean;
  disp45: boolean;
}

type RecordValue = Record<string, any>;
const RRMS: readonly GaussianRrm[] = [50, 60, 70, 80, 90, 95];

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function selectedGaussianKeys(selection: unknown): string[] {
  if (!isRecord(selection) || selection.active !== true || !isRecord(selection.selected)
    || !Object.values(selection.selected).every(value => typeof value === 'boolean')) return [];
  return Object.keys(selection.selected).filter(key => selection.selected[key] === true).sort();
}

/** Keep detector order and join class decisions only for stage-3-selected stackings. */
export function gaussianStackingTableRows(
  stackings: readonly Stacking[], marker: GaussianClassMarker | null, selectedKeys: readonly string[],
) {
  const selected = new Set(selectedKeys);
  const classes = new Map(marker?.rows.map(row => [row.key, row]));
  return stackings.map(stacking => {
    const key = stackingKey(stacking);
    const enabled = selected.has(key);
    const row = enabled ? classes.get(key) ?? null : null;
    return { key, stacking, selected: enabled, enabled: enabled && row?.excluded !== true, row };
  });
}

export function editableGaussianRow(value: unknown): GaussianClassRow | null {
  if (!isRecord(value) || typeof value.key !== 'string' || !RRMS.includes(value.rrm)
    || ('excluded' in value && typeof value.excluded !== 'boolean')) return null;
  const exclusion = value.excluded === true ? { excluded: true } : {};
  if (value.rrm === 90 || value.rrm === 95) {
    if (typeof value.tilt30 !== 'boolean' || typeof value.disp45 !== 'boolean') return null;
    return { key: value.key, rrm: value.rrm, tilt30: value.tilt30, disp45: value.disp45, ...exclusion };
  }
  return { key: value.key, rrm: value.rrm, ...exclusion };
}

/** Only stage-3-selected stackings have a stage-6 enable/disable decision. */
export function setGaussianStackingEnabled(
  marker: GaussianClassMarker, key: string, enabled: boolean, selectedKeys: readonly string[],
): GaussianClassMarker | null {
  if (!marker.active || !selectedKeys.includes(key) || !marker.basis.includes(key)
    || !marker.rows.some(row => row.key === key)) return null;
  return { ...marker, rows: marker.rows.map(row => {
    if (row.key !== key) return row;
    const { excluded: _excluded, ...filter } = row;
    return enabled ? filter : { ...filter, excluded: true };
  }) };
}

export function editableGaussianRows(values: unknown): GaussianClassRow[] | null {
  if (!Array.isArray(values)) return null;
  const rows: GaussianClassRow[] = [];
  for (const value of values) {
    const row = editableGaussianRow(value);
    if (!row) return null;
    rows.push(row);
  }
  return rows;
}

/**
 * Reconcile the S18 editor with the authoritative share. While a local write
 * is pending, the shared marker may echo an older in-flight PUT; keep the
 * current local draft so subsequent edits build on the latest user value.
 */
export function reconcileGaussianClassDraft(
  shared: unknown,
  draft: GaussianClassMarker | null,
  writePending: boolean,
): GaussianClassMarker | null {
  if (writePending || !markerIsWellFormed('gaussian_classes', shared)
    || !isRecord(shared) || shared.active !== true || !Array.isArray(shared.basis)) return draft;
  const rows = editableGaussianRows(shared.rows);
  return rows ? { schema: 1, basis: [...shared.basis], active: true, rows } : draft;
}

export function gaussianFilterName(row: GaussianClassRow): string {
  let name = `rrm${row.rrm}`;
  if (row.rrm === 90 || row.rrm === 95) {
    if (row.tilt30) name += '-tilt30';
    if (row.disp45) name += '-disp45';
  }
  return name;
}

/** Expose base classes from the backend's delivered legal filter names. */
export function gaussianRrmOptions(filterNames: readonly string[]): GaussianRrm[] {
  const values = new Set<GaussianRrm>();
  for (const name of filterNames) {
    const match = /^rrm(50|60|70|80|90|95)$/.exec(name);
    if (match) values.add(Number(match[1]) as GaussianRrm);
  }
  return [...values].sort((left, right) => left - right);
}

export function computedGaussianRows(scores: unknown, selectedKeys: readonly string[]): GaussianClassRow[] | null {
  if (!isRecord(scores) || scores.schema !== 1 || !Array.isArray(scores.classes)
    || !Array.isArray(scores.filter_names)) return null;
  const names = new Set(scores.filter_names.filter((name: unknown): name is string => typeof name === 'string'));
  const byKey = new Map<string, unknown>();
  for (const item of scores.classes) {
    if (!isRecord(item) || typeof item.key !== 'string' || byKey.has(item.key)) return null;
    byKey.set(item.key, item);
  }
  if (byKey.size !== selectedKeys.length || selectedKeys.some(key => !byKey.has(key))) return null;
  const rows: GaussianClassRow[] = [];
  for (const key of selectedKeys) {
    const computed = byKey.get(key);
    let row = editableGaussianRow(computed);
    if (row && (row.rrm === 90 || row.rrm === 95)) {
      const automatic = automaticGaussianPrefilters(computed);
      if (!automatic) return null;
      row = { key: row.key, rrm: row.rrm, ...automatic };
    }
    if (!row || !names.has(gaussianFilterName(row))) return null;
    rows.push(row);
  }
  return rows;
}

export function classMarkerForContinue(
  retained: unknown,
  scores: unknown,
  selectedKeys: readonly string[],
): GaussianClassMarker | null {
  if (markerIsWellFormed('gaussian_classes', retained) && isRecord(retained)
    && JSON.stringify([...retained.basis].sort()) === JSON.stringify([...selectedKeys].sort())) {
    const rows = editableGaussianRows(retained.rows);
    if (rows) return { schema: 1, basis: [...selectedKeys], active: true, rows };
  }
  const rows = computedGaussianRows(scores, selectedKeys);
  if (!rows) return null;
  return { schema: 1, basis: [...selectedKeys], active: true, rows };
}

/** Restore computed values for one row without disturbing any other edits. */
export function revertGaussianClassRow(
  marker: unknown,
  key: string,
  scores: unknown,
): GaussianClassMarker | null {
  if (!markerIsWellFormed('gaussian_classes', marker) || !isRecord(marker)
    || marker.active !== true || !Array.isArray(marker.basis) || !Array.isArray(marker.rows)) return null;
  const computed = computedGaussianRows(scores, marker.basis);
  const row = computed?.find(item => item.key === key);
  if (!row || !marker.rows.some((item: unknown) => isRecord(item) && item.key === key)) return null;
  return {
    schema: 1,
    basis: [...marker.basis],
    active: true,
    rows: marker.rows.map((item: GaussianClassRow) => item.key === key ? { ...row, ...(item.excluded === true ? { excluded: true } : {}) } : item),
  };
}

/** Produce the confirmed full-table copy; a cancelled action has no marker to write. */
export function copyComputedGaussianClasses(
  marker: unknown,
  scores: unknown,
  confirmed: boolean,
): GaussianClassMarker | null {
  if (!confirmed || !markerIsWellFormed('gaussian_classes', marker) || !isRecord(marker)
    || !Array.isArray(marker.basis)) return null;
  const rows = computedGaussianRows(scores, marker.basis);
  if (!rows) return null;
  const saved = new Map<string, GaussianClassRow>(marker.rows.map((row: GaussianClassRow) => [row.key, row]));
  return { schema: 1, basis: [...marker.basis], active: true,
    rows: rows.map(row => {
      const previous = saved.get(row.key);
      return previous?.excluded === true ? previous : row;
    }) };
}

export function switchGaussianClass(
  current: GaussianClassRow,
  nextRrm: GaussianRrm,
  automatic: AutomaticGaussianPrefilters,
): GaussianClassRow {
  const exclusion = current.excluded === true ? { excluded: true } : {};
  if (nextRrm < 90) return { key: current.key, rrm: nextRrm as 50 | 60 | 70 | 80, ...exclusion };
  if (current.rrm === nextRrm) return current;
  return {
    key: current.key,
    rrm: nextRrm as 90 | 95,
    tilt30: automatic.tilt30,
    disp45: automatic.disp45,
    ...exclusion,
  };
}

export function automaticGaussianPrefilters(value: unknown): AutomaticGaussianPrefilters | null {
  if (!isRecord(value)) return null;
  const automatic = isRecord(value.auto_prefilters) ? value.auto_prefilters : value;
  return typeof automatic.tilt30 === 'boolean' && typeof automatic.disp45 === 'boolean'
    ? { tilt30: automatic.tilt30, disp45: automatic.disp45 } : null;
}

export function setGaussianFlag(
  row: GaussianClassRow,
  flag: 'tilt30' | 'disp45',
  value: boolean,
): GaussianClassRow {
  if (row.rrm < 90) return row;
  return { ...row, [flag]: value } as GaussianClassRow;
}

export function gaussianRowsDiffer(left: unknown, right: unknown): boolean {
  const a = editableGaussianRow(left);
  const b = editableGaussianRow(right);
  return !a || !b || JSON.stringify(a) !== JSON.stringify(b);
}

export function gaussianClassDiffCount(marker: unknown, computed: unknown): number {
  if (!isRecord(marker) || !Array.isArray(marker.rows)) return 0;
  const rows = computedGaussianRows(computed, marker.basis);
  if (!rows) return 0;
  const byKey = new Map(rows.map(row => [row.key, row]));
  return marker.rows.reduce((count: number, row: unknown) => {
    if (!isRecord(row) || typeof row.key !== 'string' || row.excluded === true) return count;
    return count + (gaussianRowsDiffer(row, byKey.get(row.key)) ? 1 : 0);
  }, 0);
}

export function gaussianCandidateRows(scores: unknown, selectedKeys: readonly string[]): RecordValue[] {
  if (!isRecord(scores) || !Array.isArray(scores.candidate_scores)) return [];
  const selected = new Set(selectedKeys);
  return scores.candidate_scores.filter((row: unknown): row is RecordValue =>
    isRecord(row) && selected.has(row.key) && row.kept === true);
}

export function gaussianReferenceRows(scores: unknown, selectedKeys: readonly string[]): RecordValue[] {
  if (!isRecord(scores) || !Array.isArray(scores.reference_scores)) return [];
  const selected = new Set(selectedKeys);
  return scores.reference_scores.filter((row: unknown): row is RecordValue =>
    isRecord(row) && selected.has(row.key));
}

/** Geometry must describe the same worst kept candidate as the class score. */
export function gaussianStackingGeometry(scores: unknown, key: string) {
  const candidates = gaussianCandidateRows(scores, [key]).filter(row =>
    typeof row.score === 'number' && Number.isFinite(row.score));
  const bestfit = candidates.reduce<RecordValue | null>((worst, row) =>
    worst === null || row.score < worst.score ? row : worst, null);
  return { bestfit, reference: gaussianReferenceRows(scores, [key])[0] ?? null };
}
