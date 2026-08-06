import { useI18n } from '../i18n/I18nContext';

export type ManualShapeType = 'global' | 'cuboid' | 'poly2d';

export interface Vec3Form {
  x: string;
  y: string;
  z: string;
}

export interface Vec2Form {
  x: string;
  z: string;
}

export interface RegionGeometryState {
  shape: ManualShapeType;
  min: Vec3Form;
  max: Vec3Form;
  minY: string;
  maxY: string;
  points: Vec2Form[];
}

export function emptyGeometryState(shape: ManualShapeType = 'cuboid'): RegionGeometryState {
  return {
    shape,
    min: { x: '', y: '', z: '' },
    max: { x: '', y: '', z: '' },
    minY: '',
    maxY: '',
    points: [
      { x: '', z: '' },
      { x: '', z: '' },
      { x: '', z: '' },
    ],
  };
}

export function geometryFromRegion(region: {
  type: string;
  min?: { x: number; y: number; z: number };
  max?: { x: number; y: number; z: number };
  min_y?: number;
  max_y?: number;
  points?: { x: number; z: number }[];
}): RegionGeometryState {
  const shape: ManualShapeType =
    region.type === 'global' || region.type === 'manual'
      ? (region.type === 'global' ? 'global' : 'cuboid')
      : region.type === 'poly2d'
        ? 'poly2d'
        : 'cuboid';

  if (region.type === 'manual' && !region.min && !region.points) {
    return emptyGeometryState('cuboid');
  }

  return {
    shape: region.type === 'global' ? 'global' : shape,
    min: region.min
      ? { x: String(region.min.x), y: String(region.min.y), z: String(region.min.z) }
      : { x: '', y: '', z: '' },
    max: region.max
      ? { x: String(region.max.x), y: String(region.max.y), z: String(region.max.z) }
      : { x: '', y: '', z: '' },
    minY: region.min_y != null ? String(region.min_y) : '',
    maxY: region.max_y != null ? String(region.max_y) : '',
    points: region.points && region.points.length > 0
      ? region.points.map((p) => ({ x: String(p.x), z: String(p.z) }))
      : emptyGeometryState('poly2d').points,
  };
}

function parseIntStrict(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '' || !/^-?\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

export interface GeometryPayload {
  type: ManualShapeType;
  min?: { x: number; y: number; z: number };
  max?: { x: number; y: number; z: number };
  min_y?: number;
  max_y?: number;
  points?: { x: number; z: number }[];
}

export function validateGeometryState(state: RegionGeometryState):
  | { ok: true; payload: GeometryPayload }
  | { ok: false; errorKey: 'geometry.invalidNumber' | 'geometry.cuboidIncomplete' | 'geometry.poly2dIncomplete' } {
  if (state.shape === 'global') {
    return { ok: true, payload: { type: 'global' } };
  }
  if (state.shape === 'cuboid') {
    const raw = [state.min.x, state.min.y, state.min.z, state.max.x, state.max.y, state.max.z];
    const allEmpty = raw.every((v) => v.trim() === '');
    if (allEmpty) return { ok: true, payload: { type: 'cuboid' } };
    const nums = raw.map(parseIntStrict);
    if (nums.some((n) => n == null)) {
      return { ok: false, errorKey: 'geometry.invalidNumber' };
    }
    return {
      ok: true,
      payload: {
        type: 'cuboid',
        min: { x: nums[0]!, y: nums[1]!, z: nums[2]! },
        max: { x: nums[3]!, y: nums[4]!, z: nums[5]! },
      },
    };
  }
  // poly2d
  const yRaw = [state.minY, state.maxY];
  const pointRaws = state.points.map((p) => [p.x, p.z] as const);
  const anyFilled =
    yRaw.some((v) => v.trim() !== '') ||
    pointRaws.some(([x, z]) => x.trim() !== '' || z.trim() !== '');
  if (!anyFilled) return { ok: true, payload: { type: 'poly2d' } };
  const minY = parseIntStrict(state.minY);
  const maxY = parseIntStrict(state.maxY);
  if (minY == null || maxY == null) {
    return { ok: false, errorKey: 'geometry.invalidNumber' };
  }
  const points: { x: number; z: number }[] = [];
  for (const p of state.points) {
    const xEmpty = p.x.trim() === '';
    const zEmpty = p.z.trim() === '';
    if (xEmpty && zEmpty) continue;
    const x = parseIntStrict(p.x);
    const z = parseIntStrict(p.z);
    if (x == null || z == null) return { ok: false, errorKey: 'geometry.invalidNumber' };
    points.push({ x, z });
  }
  if (points.length < 3) return { ok: false, errorKey: 'geometry.poly2dIncomplete' };
  return { ok: true, payload: { type: 'poly2d', min_y: minY, max_y: maxY, points } };
}

/** Build API payload. Incomplete coords are omitted (allowed for drafts). */
export function geometryToPayload(state: RegionGeometryState): GeometryPayload {
  if (state.shape === 'global') {
    return { type: 'global' };
  }

  if (state.shape === 'cuboid') {
    const minX = parseIntStrict(state.min.x);
    const minY = parseIntStrict(state.min.y);
    const minZ = parseIntStrict(state.min.z);
    const maxX = parseIntStrict(state.max.x);
    const maxY = parseIntStrict(state.max.y);
    const maxZ = parseIntStrict(state.max.z);
    const payload: GeometryPayload = { type: 'cuboid' };
    if (minX != null && minY != null && minZ != null) {
      payload.min = { x: minX, y: minY, z: minZ };
    }
    if (maxX != null && maxY != null && maxZ != null) {
      payload.max = { x: maxX, y: maxY, z: maxZ };
    }
    return payload;
  }

  const minY = parseIntStrict(state.minY);
  const maxY = parseIntStrict(state.maxY);
  const points: { x: number; z: number }[] = [];
  for (const p of state.points) {
    const x = parseIntStrict(p.x);
    const z = parseIntStrict(p.z);
    if (x != null && z != null) points.push({ x, z });
  }
  const payload: GeometryPayload = { type: 'poly2d' };
  if (minY != null) payload.min_y = minY;
  if (maxY != null) payload.max_y = maxY;
  if (points.length > 0) payload.points = points;
  return payload;
}

export function geometryIsComplete(state: RegionGeometryState): boolean {
  if (state.shape === 'global') return true;
  const payload = geometryToPayload(state);
  if (state.shape === 'cuboid') {
    return payload.min != null && payload.max != null;
  }
  return (
    payload.min_y != null
    && payload.max_y != null
    && (payload.points?.length ?? 0) >= 3
  );
}

interface RegionGeometryEditorProps {
  value: RegionGeometryState;
  onChange: (next: RegionGeometryState) => void;
  disabled?: boolean;
}

export function RegionGeometryEditor({
  value,
  onChange,
  disabled = false,
}: RegionGeometryEditorProps) {
  const { t } = useI18n();
  const isGlobal = value.shape === 'global';

  const setShape = (shape: ManualShapeType) => {
    onChange({ ...value, shape });
  };

  const setMin = (key: keyof Vec3Form, raw: string) => {
    onChange({ ...value, min: { ...value.min, [key]: raw } });
  };

  const setMax = (key: keyof Vec3Form, raw: string) => {
    onChange({ ...value, max: { ...value.max, [key]: raw } });
  };

  const setPoint = (index: number, key: keyof Vec2Form, raw: string) => {
    const points = value.points.map((p, i) => (i === index ? { ...p, [key]: raw } : p));
    onChange({ ...value, points });
  };

  const addPoint = () => {
    onChange({ ...value, points: [...value.points, { x: '', z: '' }] });
  };

  const removePoint = (index: number) => {
    if (value.points.length <= 3) return;
    onChange({ ...value, points: value.points.filter((_, i) => i !== index) });
  };

  return (
    <div className="region-geometry-editor">
      <label className="checkbox-label geometry-global-label">
        <input
          type="checkbox"
          checked={isGlobal}
          disabled={disabled}
          onChange={(e) => setShape(e.target.checked ? 'global' : 'cuboid')}
        />
        <span>{t('addRegion.global')}</span>
      </label>

      {!isGlobal && (
        <>
          <label className="geometry-shape-label">
            <span className="geometry-field-caption">{t('region.shapeType')}</span>
            <select
              value={value.shape === 'global' ? 'cuboid' : value.shape}
              disabled={disabled}
              onChange={(e) => setShape(e.target.value as ManualShapeType)}
            >
              <option value="cuboid">cuboid</option>
              <option value="poly2d">poly2d</option>
            </select>
          </label>

          {value.shape === 'cuboid' && (
            <div className="geometry-cuboid">
              <p className="partners-subtitle">{t('region.coordsMin')}</p>
              <div className="geometry-xyz">
                <label>
                  X
                  <input value={value.min.x} disabled={disabled} onChange={(e) => setMin('x', e.target.value)} />
                </label>
                <label>
                  Y
                  <input value={value.min.y} disabled={disabled} onChange={(e) => setMin('y', e.target.value)} />
                </label>
                <label>
                  Z
                  <input value={value.min.z} disabled={disabled} onChange={(e) => setMin('z', e.target.value)} />
                </label>
              </div>
              <p className="partners-subtitle">{t('region.coordsMax')}</p>
              <div className="geometry-xyz">
                <label>
                  X
                  <input value={value.max.x} disabled={disabled} onChange={(e) => setMax('x', e.target.value)} />
                </label>
                <label>
                  Y
                  <input value={value.max.y} disabled={disabled} onChange={(e) => setMax('y', e.target.value)} />
                </label>
                <label>
                  Z
                  <input value={value.max.z} disabled={disabled} onChange={(e) => setMax('z', e.target.value)} />
                </label>
              </div>
            </div>
          )}

          {value.shape === 'poly2d' && (
            <div className="geometry-poly2d">
              <div className="geometry-xyz">
                <label>
                  min-y
                  <input
                    value={value.minY}
                    disabled={disabled}
                    onChange={(e) => onChange({ ...value, minY: e.target.value })}
                  />
                </label>
                <label>
                  max-y
                  <input
                    value={value.maxY}
                    disabled={disabled}
                    onChange={(e) => onChange({ ...value, maxY: e.target.value })}
                  />
                </label>
              </div>
              <p className="partners-subtitle">{t('region.poly2dPointsEdit')}</p>
              {value.points.map((point, index) => (
                <div key={index} className="geometry-point-row">
                  <label>
                    X
                    <input
                      value={point.x}
                      disabled={disabled}
                      onChange={(e) => setPoint(index, 'x', e.target.value)}
                    />
                  </label>
                  <label>
                    Z
                    <input
                      value={point.z}
                      disabled={disabled}
                      onChange={(e) => setPoint(index, 'z', e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="inline-toggle-btn"
                    disabled={disabled || value.points.length <= 3}
                    onClick={() => removePoint(index)}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button type="button" className="inline-toggle-btn" disabled={disabled} onClick={addPoint}>
                {t('region.addPoint')}
              </button>
            </div>
          )}

          <div className="geometry-clear-row">
            <button
              type="button"
              className="warning"
              disabled={disabled}
              onClick={() => onChange(emptyGeometryState(value.shape === 'global' ? 'cuboid' : value.shape))}
            >
              {t('region.clearGeometry')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
