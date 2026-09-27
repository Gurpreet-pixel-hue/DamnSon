import type { Node, Edge } from "@xyflow/react";
import type { MetroVM, StationVM } from "./viewModel";

export interface FlowNodeData extends Record<string, unknown> {
  station: StationVM;
  isFocusedStage: boolean;
  isSelected: boolean;
  isHovered: boolean;
  ariaLabel: string;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

export type FlowStationNode = Node<FlowNodeData, "station">;
export type FlowTrackEdge = Edge;

export interface Flow2DGraphOptions {
  focusStage: number; // 1-indexed stage
  selectedStepId: string | null;
  hoveredStepId: string | null;
  criticalPathOn: boolean;
  onSelectStep?: (id: string) => void;
  onHoverStep?: (id: string | null) => void;
}

// Color tokens per docs/frontend-spec.md and PRD §11.6
const TOKENS = {
  border: "#E4DACA",
  critical: "#D92D20",
  available: "#1F63D6",
  undecided: "#B45309",
} as const;

/**
 * Builds pure React Flow nodes and edges from MetroVM (frontend-spec '2D view' & Amendment 3):
 * - Positions come directly from position2D (computeMetroLayout / fromJourney).
 * - Colours come from palette tokens.
 * - Critical path edges render with strokeWidth 3px.
 * - Nodes in focusStage are full opacity/accented; other stages are dimmed.
 */
export function buildFlow2DGraph(
  metro: MetroVM,
  options: Flow2DGraphOptions
): { nodes: FlowStationNode[]; edges: FlowTrackEdge[] } {
  const {
    focusStage,
    selectedStepId,
    hoveredStepId,
    criticalPathOn,
    onSelectStep = () => {},
    onHoverStep = () => {},
  } = options;

  const nodes: FlowStationNode[] = [];
  const edges: FlowTrackEdge[] = [];

  const stationMap = new Map<string, StationVM>(
    metro.stations.map((s) => [s.id, s])
  );
  const totalSteps = metro.stations.length;

  for (let i = 0; i < metro.stations.length; i++) {
    const station = metro.stations[i]!;
    const stepIndex = i + 1;

    // layer is 0-indexed; focusStage is 1-indexed (§11.1)
    const isFocusedStage = station.layer === focusStage - 1;
    const isSelected = station.id === selectedStepId;
    const isHovered = station.id === hoveredStepId;

    // Count finished incoming "requires" prerequisites
    const finishedPrereqsCount = metro.tracks.filter(
      (t) =>
        t.to === station.id &&
        t.kind === "requires" &&
        stationMap.get(t.from)?.state === "done"
    ).length;

    const ariaLabel = `Step ${stepIndex} of ${totalSteps}, ${station.title}, ${station.state}, ${finishedPrereqsCount} prerequisites done`;

    nodes.push({
      id: station.id,
      type: "station",
      position: {
        x: station.position2D.x,
        y: station.position2D.y,
      },
      data: {
        station,
        isFocusedStage,
        isSelected,
        isHovered,
        ariaLabel,
        onSelect: onSelectStep,
        onHover: onHoverStep,
      },
      draggable: false,
      selectable: true,
      ariaLabel,
    });
  }

  for (const track of metro.tracks) {
    const fromStation = metro.stations.find((s) => s.id === track.from);
    const toStation = metro.stations.find((s) => s.id === track.to);

    const isCritical = criticalPathOn && track.critical;
    const isFocused =
      fromStation?.layer === focusStage - 1 ||
      toStation?.layer === focusStage - 1;

    let strokeColor: string = TOKENS.border;
    let strokeWidth = 2;
    let strokeDasharray: string | undefined = undefined;

    if (isCritical) {
      strokeColor = TOKENS.critical;
      strokeWidth = 3; // Amendment 3: critical path at 3 px
    } else if (track.toAvailable && track.kind === "requires") {
      strokeColor = TOKENS.available;
      strokeWidth = 2;
    } else if (track.dashed) {
      strokeColor = TOKENS.undecided;
      strokeDasharray = "5 5";
      strokeWidth = 2;
    }

    edges.push({
      id: track.id,
      source: track.from,
      target: track.to,
      type: "smoothstep",
      style: {
        stroke: strokeColor,
        strokeWidth,
        strokeDasharray,
        opacity: isFocused || isCritical ? 1 : 0.35,
        transition: "stroke 0.2s, opacity 0.2s",
      },
      animated: track.toAvailable,
    });
  }

  return { nodes, edges };
}
