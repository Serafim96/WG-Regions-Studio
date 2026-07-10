export interface RegionData {
  id: string;
  type: 'cuboid' | 'poly2d' | 'global' | 'manual';
  parent: string | null;
  priority: number;
  flags: Record<string, unknown>;
  owners: Record<string, unknown>;
  members: Record<string, unknown>;
  min?: { x: number; y: number; z: number };
  max?: { x: number; y: number; z: number };
  min_y?: number;
  max_y?: number;
  points?: { x: number; z: number }[];
  is_manual?: boolean;
}

export interface SpatialEdge {
  source: string;
  target: string;
  relation: 'intersects' | 'contains';
}

export interface HierarchyEdge {
  source: string;
  target: string;
  relation: 'parent';
}

export interface Scheme {
  schemaVersion: number;
  sourceHash: string;
  sourcePath: string;
  builtAt: string;
  regions: RegionData[];
  forest: { roots: ForestNode[] };
  hierarchyEdges: HierarchyEdge[];
  spatialEdges: SpatialEdge[];
  layout: Record<string, { x: number; y: number }>;
  metrics: MetricsData;
}

export interface ForestNode {
  id: string;
  depth: number;
  children: ForestNode[];
}

export interface MetricsData {
  total: number;
  by_type: Record<string, number>;
  by_volume: { id: string; type: string; volume: number | null }[];
  by_points: { id: string; points: number }[];
  by_intersections: { id: string; count: number }[];
}

export interface FlagInfo {
  name: string;
  type: string;
  description: string;
}
