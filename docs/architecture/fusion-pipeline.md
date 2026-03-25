# Analysis & Fusion Pipeline Contract (Draft)

## Pipeline shape
- Input artifacts (wifi scans, optional camera/sensor streams)
- Queue-based analysis jobs
- Structured result artifacts + confidence scores

## Initial job types
- `wifi_enrichment`
- `vision_analysis`
- `route_analysis`
- `sensor_fusion`

## Contract principles
- Core scanning works without any analysis jobs.
- Analysis writes back as linked artifacts, not inline request latency.
- Raw observations remain queryable beside enriched output.
