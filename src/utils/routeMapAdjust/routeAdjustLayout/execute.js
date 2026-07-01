/**
 * 站點與路線調整八演算法 executeFunction（dataStore 用）。
 * 輸入固定為上游「站點與路線調整前置」；演算法與示意圖佈局 #1–#8 相同。
 */

import { runRouteAdjustLiveLayout } from './runLiveLayout.js';
import {
  ROUTE_ADJUST_STROKE_LAYER_ID,
  ROUTE_ADJUST_HILLCLIMB_LAYER_ID,
  ROUTE_ADJUST_MILP_LAYER_ID,
  ROUTE_ADJUST_FORCE_LAYER_ID,
  ROUTE_ADJUST_WANGCHI_LAYER_ID,
  ROUTE_ADJUST_BAST_LAYER_ID,
  ROUTE_ADJUST_MERRICK_LAYER_ID,
  ROUTE_ADJUST_SAT_LAYER_ID,
} from './layerIds.js';

export async function executeRouteAdjustStroke() {
  return runRouteAdjustLiveLayout(
    ROUTE_ADJUST_STROKE_LAYER_ID,
    'stroke',
    '① 站點與路線調整（Stroke-based）'
  );
}

export async function executeRouteAdjustHillClimb() {
  return runRouteAdjustLiveLayout(
    ROUTE_ADJUST_HILLCLIMB_LAYER_ID,
    'hillclimb',
    '② 站點與路線調整（Hill Climbing）'
  );
}

export async function executeRouteAdjustMilp() {
  return runRouteAdjustLiveLayout(
    ROUTE_ADJUST_MILP_LAYER_ID,
    'milp',
    '③ 站點與路線調整（MILP）'
  );
}

export async function executeRouteAdjustForce() {
  return runRouteAdjustLiveLayout(
    ROUTE_ADJUST_FORCE_LAYER_ID,
    'force',
    '④ 站點與路線調整（力導向）'
  );
}

export async function executeRouteAdjustWangChi() {
  return runRouteAdjustLiveLayout(
    ROUTE_ADJUST_WANGCHI_LAYER_ID,
    'wangchi',
    '⑤ 站點與路線調整（Wang & Chi）'
  );
}

export async function executeRouteAdjustBast() {
  return runRouteAdjustLiveLayout(
    ROUTE_ADJUST_BAST_LAYER_ID,
    'bast',
    '⑥ 站點與路線調整（Bast 格網最短路）'
  );
}

export async function executeRouteAdjustMerrick() {
  return runRouteAdjustLiveLayout(
    ROUTE_ADJUST_MERRICK_LAYER_ID,
    'merrick',
    '⑦ 站點與路線調整（Merrick 路徑簡化）'
  );
}

export async function executeRouteAdjustSat() {
  return runRouteAdjustLiveLayout(
    ROUTE_ADJUST_SAT_LAYER_ID,
    'sat',
    '⑧ 站點與路線調整（SAT）'
  );
}
