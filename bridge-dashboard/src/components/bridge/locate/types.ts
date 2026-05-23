export type Tfw = { a: number; b: number; d: number; e: number; c: number; f: number } | null;

export type LocateItem = {
  path: string;
  fileUrl: string;
  width: number;
  height: number;
  tfw?: Tfw;
  bridgeGeometryMissing?: boolean;
  bridgeGeometryMissingReason?: string;
  bridgePolygonPx: Array<[number, number]> | null;
  centerlinePx?: Array<[number, number]> | null;
  centerPointPx?: [number, number] | null;
  impactPolygonPx?: Array<[number, number]> | null;
  predecessorBridgePolygonsPx?: Array<Array<[number, number]>> | null;
  predecessorImpactPolygonsPx?: Array<Array<[number, number]>> | null;
  predecessorImpactLabelItems?: Array<{ name?: string; polygonPx?: Array<[number, number]> | null }> | null;
  successorBridgePolygonsPx?: Array<Array<[number, number]>> | null;
  successorImpactPolygonsPx?: Array<Array<[number, number]>> | null;
  successorImpactLabelItems?: Array<{ name?: string; polygonPx?: Array<[number, number]> | null }> | null;
  segmentId?: number | string;
  imagePath?: string;
  worldFilePath?: string;
  jsonPath?: string;
  worldFileUrl?: string;
  jsonUrl?: string;
  resultPath?: string;
  resultFileUrl?: string;
  resultReadable?: boolean;
  resultConfirmed?: boolean;
  hasUnconfirmedBatch?: boolean;
  batchPaths?: string[];
  batchFileUrl?: string;
  inpaintJobId?: string;
  kind?: 'segment' | 'segment_result' | 'merged_result';
  maskSamPath?: string;
  maskCutPath?: string;
  mergedMaskPath?: string;
  overlayPath?: string;
  shadowMaskPath?: string;
};

export type DomLocateResponse = {
  taskId: string;
  domCount: number;
  dependencyCount: number;
  successorCount?: number;
  doms: LocateItem[];
};

export type PreprocessSegmentsResponse = {
  taskId: string;
  manifestPresent?: boolean;
  manifestSource?: string | null;
  manifestError?: string | null;
  manifestSteps?: Array<{ name?: string; status?: string; error?: string }> | null;
  segmentCount: number;
  allSegmentResultsReady?: boolean;
  segments: LocateItem[];
};

export type Raster = {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
};

export type LoadedTile = {
  item: LocateItem;
  status: 'idle' | 'loading' | 'loaded' | 'failed';
  width: number;
  height: number;
  bitmap: ImageBitmap | null;
  boundsWorld: { minX: number; minY: number; maxX: number; maxY: number } | null;
  error?: string;
};

export type ViewState = {
  scale: number;
  offsetX: number;
  offsetY: number;
};