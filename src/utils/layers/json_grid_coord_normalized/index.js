/**
 * 圖層 json_grid_coord_normalized：座標正規化（模組分檔於本資料夾，對齊 osm_2_geojson_2_json）。
 */

export {
  JSON_GRID_COORD_NORMALIZED_LAYER_ID,
  JSON_GRID_FROM_COORD_NORMALIZED_LAYER_ID,
  POINT_ORTHOGONAL_LAYER_ID,
  LINE_ORTHOGONAL_LAYER_ID,
  CONNECT_STRAIGHTEN_HV_LAYER_ID,
  LINE_ORTHOGONAL_VERT_FIRST_LAYER_ID,
  LINE_ORTHOGONAL_VERT_FIRST_MIRROR_DRAW_LAYER_ID,
  LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY,
  LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_COPY_2,
  LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_RMA,
  LAYOUT_NETWORK_GRID_FROM_VH_DRAW_LAYER_ID_RMA_2,
  SCHEMATIC_RMA_TOWARD_CENTER_VH_SOURCE_LAYER_ID,
  isLayoutVhDrawMainCopyLayerId,
  isLayoutVhDrawSecondCopyLayerId,
  isRmaLayoutNetworkGridFromVhDrawLayerId,
  COORD_NORMALIZED_RED_BLUE_LIST_LAYER_ID,
  LINE_ORTHOGONAL_TOWARD_CENTER_LAYER_IDS,
  SCHEMATIC_TOWARD_CENTER_HV_LAYER_ID,
  SCHEMATIC_TOWARD_CENTER_VH_LAYER_ID,
  SCHEMATIC_RMA_TOWARD_CENTER_HV_LAYER_ID,
  SCHEMATIC_RMA_TOWARD_CENTER_VH_LAYER_ID,
  SCHEMATIC_RMA_ROUTE_ADJUST_LAYER_ID,
  ROUTE_ADJUST_LAYOUT_LAYER_IDS,
  isRouteAdjustLayoutLayer,
  SCHEMATIC_TOWARD_CENTER_LAYER_IDS,
  isLineOrthogonalTowardCenterLayerId,
  isVertFirstTowardCenterLayerId,
  isOrthogonalVhDataJsonDrawMirrorLayerId,
  isLayoutNetworkGridFromVhDrawLayerId,
  isSpaceGridVhDrawFamilyLayerId,
  isCoordNormalizedDataJsonMirrorFollowonLayerId,
} from './layerIds.js';
export { jsonViewerPayloadForCoordNormalizedFamilyLayer } from './jsonViewerPayloadForCoordNormalizedFamilyLayer.js';
export {
  applyOsm2DataJsonSyncedLayerFromParent,
  resetJsonGridCoordNormalizedPipelineFields,
  syncJsonGridCoordNormalizedDataJsonFromPipeline,
  syncOsm2DataJsonMirrorFromParent,
  jsonGridCoordNormalizedPersistPayload,
  mirrorResetAndPersistJsonGridCoordNormalized,
  reloadJsonGridCoordNormalizedLayer,
} from './mirrorFromOsm2Layer.js';
export {
  applyCoordNormalizedLayerDataJsonToFollowon,
  resetJsonGridFromCoordNormalizedPipelineFields,
  jsonGridFromCoordNormalizedPersistPayload,
  mirrorResetAndPersistJsonGridFromCoordNormalized,
  reloadJsonGridFromCoordNormalizedLayer,
  syncJsonGridFromCoordNormalizedMirrorFromParent,
  refreshLineOrthogonalFromPointOrthogonalIfVisible,
  refreshOrthogonalVhMirrorDrawLayerIfVisible,
  refreshLayoutNetworkGridFromVhDrawIfVisibleCopy,
  refreshLayoutNetworkGridFromVhDrawIfVisibleCopy2,
  syncLayoutNetworkGridRoutesDataJsonFromVhDrawCopy,
  syncLayoutNetworkGridRoutesDataJsonFromVhDrawCopy2,
  syncRmaLayoutNetworkGridFromTowardCenterVh,
  refreshRmaLayoutNetworkGridFromVhIfVisible,
  syncJsonGridFromCoordDataJsonFromPipeline,
} from './mirrorFromCoordNormalizedLayer.js';
export { minimalOsmXmlFromLonLatFeatureCollection } from './minimalOsmXmlFromGeoJson.js';
export {
  LAYOUT_SEGMENT_TRAFFIC_WEIGHT_KEY,
  layoutTrafficStationDisplayName,
  layoutTrafficStationPairLabel,
  layoutTrafficUndirectedPairKey,
  clearTrafficWeightsFromExportRows,
  applyCsvTrafficWeightsToExportRows,
  applyLayoutTrafficCsvToVhDrawLayerRoots,
  applyRandomLayoutTrafficWeightsToVhDrawLayerRoots,
  buildSyntheticTrafficRowsFromVhDrawLayer,
  getNodeTrafficWeightFromLayoutSegment,
  buildLayoutVhDrawCopyBlackDotTrafficDataTableRows,
  sortLayoutVhDrawCopyBlackDotDataTableRowsByWeightDiffAsc,
} from './layoutTrafficWeightsSync.js';
export {
  layoutVhDrawCopyRouteLabelFromExportRow,
  findLayoutSegmentMidNeighbors,
  layoutVhDrawCopyBlackDotRowMatchKey,
  classifyLayoutVhDrawBlackDotGeomKind,
  LAYOUT_VH_DRAW_COPY_GRID_NEIGHBOR_HIDE_MIN_PT,
} from './layoutVhDrawBlackDotGeomKind.js';
export {
  buildVhDrawStationRowsForLayoutMap,
  maxLayoutVhDrawBlackDotsOnLegInOpenXSlab,
  maxLayoutVhDrawBlackDotsOnLegInOpenYSlab,
  maxLayoutVhDrawBlackDotsOnLegInOpenXSlabPlotPx,
  maxLayoutVhDrawBlackDotsOnLegInOpenYSlabPlotPx,
  maxLayoutVhDrawLineWeightInOpenXSlab,
  maxLayoutVhDrawLineWeightInOpenYSlab,
  maxLayoutVhDrawLineWeightInOpenXSlabPlotPx,
  maxLayoutVhDrawLineWeightInOpenYSlabPlotPx,
  buildLayoutNetworkVhDrawMaxBlackDotsPerOrthoLine,
  featureCollectionGridBounds,
  computeLayoutVhDrawFineGridSpec,
  computeLayoutVhDrawBlackDotRowColRatioReport,
  applyLayoutVhDrawFineGridToFeatureCollection,
  gridXYAtGridDistanceAlongLineString,
  integerLatticeBlackDotAtGridArcLengthAlongOrthoLineString,
  integerLatticeBlackDotAtPixelArcLengthAlongLineString,
  integerLatticeBlackDotAtPixelArcLengthAlongFineSubgridLineString,
  layoutVhDrawInteriorTurnVertexIndices,
  computeLayoutVhDrawFineBlackDotsTurnRbRedistribute,
  snapSegmentInteriorToIntegerLattice,
  snapSegmentInteriorToFineSubgridLattice,
  snapBlackDotGxGyToFineSubgridAlongPolyline,
  snapBlackDotGxGyToIntegerLatticeAlongPolyline,
} from './layoutVhDrawFineIntegerGrid.js';
export {
  lineStringFeatureCollectionFromSpaceNetwork,
  writeLayoutNormalizedLayerDataOsmFromNetwork,
  resolveB3InputSpaceNetwork,
  buildC3NetworkForCoordNormalize,
} from './jsonGridCoordNormalizeHelpers.js';
export {
  executeJsonGridCoordNormalize,
  executeJsonGridCoordNormalizedPruneEmptyGridLines,
  executeJsonGridNeighborTopologyFix,
} from './executeJsonGridCoordNormalize.js';
export {
  executeJsonGridFromCoordNormalizedAxisAlign,
  executeJsonGridFromCoordNormalizedPruneEmptyGridLines,
} from './executeJsonGridFromCoordNormalizedAxisAlign.js';
export {
  replaceDiagonalEdgesWithLOrtho,
  replaceOneDiagonalInRoute,
  replaceDiagonalsInRouteUntilClear,
  peekDiagonalReplaceNextUnitArmHighlightBundle,
} from './replaceDiagonalEdgesWithLOrtho.js';
export {
  listUnitOrthogonalLCandidates,
  tryReplaceUnitOrthogonalLWith45,
  replaceUnitOrthogonalLWith45DiagonalWhereClear,
  unitOrthogonalL45HighlightBundle,
} from './replaceUnitOrthogonalLWith45Diagonal.js';
export {
  listOrthogonalLShapesInFlatSegments,
  orthoBundleHighlightForLShape,
  orthoBundleHighlightForAllLShapes,
} from './listOrthogonalLShapesInFlatSegments.js';
export {
  tryFlipOrthogonalLShapeInFlatSegments,
  flipFirstPossibleOrthogonalLShapeInFlatSegments,
} from './flipOrthogonalLShapeInFlatSegments.js';
export {
  findBestCoPointGroupTargetOnGrid,
  applyBestCoPointGroupMoveOnGrid,
  findBestConnectPointMoveForHV,
  runConnectPointsHVMaximizeToFixpoint,
} from './axisAlignGridNetworkHillClimb.js';
export { tryOrthoTowardCrossNudgeFromReportItem } from './orthoNudgeTowardCrossCenter.js';
export { applyLineOrthoHubBlueDiagonalPrepassSegments } from './lineOrthoHubBlueDiagonalPrepass.js';
export {
  shallowCloneOrthoSegmentsSynced,
  buildInitialOrthoCoPointGroups,
} from './axisAlignGridNetworkHillClimb.js';
