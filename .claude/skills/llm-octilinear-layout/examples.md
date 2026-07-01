# Examples

## 最小範例 payload

```json
{
  "meta": { "connectCount": 3, "edgeCount": 2, "initialSpan": 12 },
  "nodes": [
    { "id": 0, "key": "n:A", "name": "A", "geo": [121.0, 25.0], "initial_grid": [0, 4] },
    { "id": 1, "key": "n:B", "name": "B", "geo": [121.01, 25.0], "initial_grid": [4, 4] },
    { "id": 2, "key": "n:C", "name": "C", "geo": [121.005, 25.01], "initial_grid": [2, 0] }
  ],
  "edges": [
    { "id": 0, "u": 0, "v": 1, "routes": ["L1"] },
    { "id": 1, "u": 1, "v": 2, "routes": ["L1"] }
  ],
  "junctions": [
    {
      "junctionKey": "n:B",
      "junctionName": "B",
      "branches": [
        { "branchKey": "n:A", "branchName": "A", "leaveAngleDeg": 180, "routes": ["L1"] },
        { "branchKey": "n:C", "branchName": "C", "leaveAngleDeg": 270, "routes": ["L1"] }
      ]
    }
  ],
  "output_schema": { "coords": [{ "id": 0, "x": 0, "y": 4 }, { "id": 1, "x": 4, "y": 4 }, { "id": 2, "x": 4, "y": 0 }] }
}
```

合法 LLM 回覆（L 形，全 HV）：

```json
{
  "coords": [
    { "id": 0, "x": 0, "y": 4 },
    { "id": 1, "x": 4, "y": 4 },
    { "id": 2, "x": 4, "y": 0 }
  ],
  "notes": "horizontal A-B, vertical B-C"
}
```

## Repair prompt 範例

validate 回傳：

```json
{
  "violations": {
    "hvEdges": 1,
    "diagonalEdges": 0,
    "skewEdges": 1,
    "hvRatio": 0.5,
    "crossings": 0,
    "overlaps": 0,
    "clashes": 0,
    "rotationFail": 0
  },
  "repairHints": [
    "H1 soft: 1/2 edges are HV (50%). Try converting non-HV edges to axis-aligned L-paths where H2–H4 still hold.",
    "Edge 0 (node 0→1, skew): dx=3 dy=1; prefer HV by moving one endpoint to share x or y."
  ]
}
```

追加到 Repair turn 的 `{{VIOLATIONS_JSON}}` 與 `{{REPAIR_HINTS}}` 即可。
