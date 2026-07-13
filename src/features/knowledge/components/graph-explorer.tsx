/** 知识图谱模块：Canvas 力导向图谱渲染器（d3-force） */

import { useRef, useEffect, useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import { useKnowledgeGraph, useBacklinks, useRebuildGraph } from "../hooks/use-knowledge-graph";
import { GraphControls } from "./graph-controls";
import { GraphNodeDetail } from "./graph-node-detail";
import type { GraphNode as GNode, GraphLink as GLink } from "../types";
import type { Simulation, SimulationNodeDatum, SimulationLinkDatum } from "d3-force";

// 模拟 d3-force 的 ForceNode/ForceLink 类型
interface ForceNode extends SimulationNodeDatum {
  id: string;
  label: string;
  type: "document" | "chunk";
  color: string;
  size: number;
  content?: string;
  vx: number;
  vy: number;
  x: number;
  y: number;
}

/** 力导向图内部使用的连线，仿真后 source/target 会替换为节点对象。 */
interface ForceLink extends SimulationLinkDatum<ForceNode> {
  source: string | ForceNode;
  target: string | ForceNode;
  value: number;
}

// 在浏览器中动态导入 d3-force

/** 图谱交互状态 */
interface GraphInteraction {
  hoveredNode: string | null;
  selectedNode: GNode | null;
}

/** 图谱主组件 */
export function GraphExplorer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const simulationRef = useRef<Simulation<ForceNode, ForceLink> | null>(null);
  const nodesRef = useRef<ForceNode[]>([]);
  const linksRef = useRef<ForceLink[]>([]);
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const animFrameRef = useRef<number>(0);
  const [d3Ready, setD3Ready] = useState(false);
  const [d3Force, setD3Force] = useState<typeof import("d3-force") | null>(null);
  const hoveredNodeRef = useRef<string | null>(null);
  const selectedNodeRef = useRef<string | null>(null);

  // 筛选状态
  const [minSimilarity, setMinSimilarity] = useState(0.7);
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);

  // 交互状态
  const [interaction, setInteraction] = useState<GraphInteraction>({
    hoveredNode: null,
    selectedNode: null,
  });
  // 从选中的节点 ID 推导用于反链查询的 chunkId
  const detailNode = interaction.selectedNode;

  const { data: graphData, isLoading: graphLoading } = useKnowledgeGraph({
    minSimilarity,
    documentIds: selectedDocIds.length > 0 ? selectedDocIds : undefined,
  });
  const { data: backlinksData, isLoading: backlinksLoading } = useBacklinks(
    detailNode?.type === "chunk" ? detailNode.id : null,
    minSimilarity,
  );
  const rebuildMutation = useRebuildGraph();

  // 动态导入 d3-force
  useEffect(() => {
    let cancelled = false;
    import("d3-force").then((d3) => {
      if (!cancelled) {
        setD3Force(d3);
        setD3Ready(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // 数据变化时重建仿真（不含 hoveredNode，防止每次悬停都重启仿真）
  useEffect(() => {
    if (!d3Force || !graphData || !canvasRef.current) return;

    const { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } = d3Force;

    // 构建 nodes 和 links
    const nodes: ForceNode[] = (graphData.nodes ?? []).map((n) => ({
      id: n.id,
      label: n.label,
      type: n.type,
      color: n.color,
      size: n.type === "document" ? 16 : 5,
      content: n.content,
      vx: 0,
      vy: 0,
      x: Math.random() * 600,
      y: Math.random() * 400,
    }));

    const nodeIds = new Set(nodes.map((n) => n.id));
    const links: ForceLink[] = (graphData.links ?? [])
      .filter((l) => nodeIds.has(l.source as string) && nodeIds.has(l.target as string))
      .map((l) => ({ source: l.source, target: l.target, value: l.value }));

    nodesRef.current = nodes;
    linksRef.current = links;

    // 创建仿真
    const sim = forceSimulation<ForceNode>(nodes)
      .force(
        "link",
        forceLink<ForceNode, ForceLink>(links)
          .id((node) => node.id)
          .distance(60),
      )
      .force("charge", forceManyBody().strength(-120))
      .force("center", forceCenter(300, 250))
      .force(
        "collide",
        forceCollide<ForceNode>().radius((node) => node.size + 4),
      );

    simulationRef.current = sim;

    // 每次 tick 重绘
    sim.on("tick", () => {
      if (canvasRef.current) {
        renderGraph(canvasRef.current, nodes, links, transformRef.current, hoveredNodeRef.current);
      }
    });

    // 3 秒后停止仿真（保持布局稳定）
    setTimeout(() => {
      if (simulationRef.current) {
        simulationRef.current.alpha(0).stop();
      }
    }, 3000);

    return () => {
      sim.stop();
    };
  }, [graphData, d3Force]);

  // 悬停变化时重绘 canvas（不重启仿真）
  useEffect(() => {
    if (!canvasRef.current || nodesRef.current.length === 0) return;
    renderGraph(
      canvasRef.current,
      nodesRef.current,
      linksRef.current,
      transformRef.current,
      interaction.hoveredNode,
    );
  }, [interaction.hoveredNode]);

  useEffect(() => {
    selectedNodeRef.current = interaction.selectedNode?.id ?? null;
  }, [interaction.selectedNode]);

  /** Canvas 渲染函数 */
  function renderGraph(
    canvas: HTMLCanvasElement,
    nodes: ForceNode[],
    links: ForceLink[],
    transform: { x: number; y: number; scale: number },
    hoveredNodeId: string | null,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const { x: tx, y: ty, scale: s } = transform;

    // 清空
    ctx.clearRect(0, 0, rect.width, rect.height);

    // 暗色背景
    ctx.fillStyle = getComputedStyle(canvas).getPropertyValue("--background") || "#0f0f13";
    ctx.fillRect(0, 0, rect.width, rect.height);

    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(s, s);

    // 绘制连线
    ctx.strokeStyle = "rgba(100, 116, 139, 0.15)";
    ctx.lineWidth = 0.5;
    for (const link of links) {
      const source =
        typeof link.source === "object" ? link.source : nodes.find((n) => n.id === link.source);
      const target =
        typeof link.target === "object" ? link.target : nodes.find((n) => n.id === link.target);
      if (!source || !target) continue;

      ctx.beginPath();
      ctx.moveTo((source as ForceNode).x, (source as ForceNode).y);
      ctx.lineTo((target as ForceNode).x, (target as ForceNode).y);
      ctx.stroke();
    }

    // 绘制节点
    for (const node of nodes) {
      const isHovered = node.id === hoveredNodeId;
      const isSelected = selectedNodeRef.current === node.id;

      ctx.beginPath();
      ctx.arc(node.x, node.y, node.size * (isHovered || isSelected ? 1.5 : 1), 0, Math.PI * 2);

      // 发光效果
      if (isHovered || isSelected) {
        ctx.shadowColor = node.color;
        ctx.shadowBlur = 20;
      }

      ctx.fillStyle = node.color + (isHovered ? "cc" : "99");
      ctx.fill();

      // 重置阴影
      ctx.shadowBlur = 0;

      // 文档节点外圈
      if (node.type === "document") {
        ctx.strokeStyle = node.color + "44";
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // 标签（只在文档节点或悬停时显示）
      if (node.type === "document" || isHovered) {
        ctx.fillStyle = "#e2e8f0";
        ctx.font = "10px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(node.label, node.x, node.y + node.size + 12);
      }
    }

    ctx.restore();
  }

  /** 处理 Canvas 点击 */
  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const { x: tx, y: ty, scale: s } = transformRef.current;
    const mx = (e.clientX - rect.left - tx) / s;
    const my = (e.clientY - rect.top - ty) / s;

    // 查找最近的节点
    let closest: ForceNode | null = null;
    let minDist = Infinity;
    for (const node of nodesRef.current) {
      const dx = mx - (node.x || 0);
      const dy = my - (node.y || 0);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < node.size * 2 && dist < minDist) {
        minDist = dist;
        closest = node;
      }
    }

    if (closest) {
      const graphNode = graphData?.nodes?.find((n) => n.id === closest!.id) ?? null;
      setInteraction({ ...interaction, selectedNode: graphNode });
    } else {
      setInteraction({ ...interaction, selectedNode: null });
    }
  }

  /** 处理鼠标悬停 */
  function handleMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const { x: tx, y: ty, scale: s } = transformRef.current;
    const mx = (e.clientX - rect.left - tx) / s;
    const my = (e.clientY - rect.top - ty) / s;

    let closest: string | null = null;
    let minDist = Infinity;
    for (const node of nodesRef.current) {
      const dx = mx - (node.x || 0);
      const dy = my - (node.y || 0);
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < node.size * 2 && dist < minDist) {
        minDist = dist;
        closest = node.id;
      }
    }

    hoveredNodeRef.current = closest;
    setInteraction((prev) => ({ ...prev, hoveredNode: closest }));
  }

  /** 滚轮缩放 */
  function handleWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    transformRef.current.scale = Math.min(Math.max(transformRef.current.scale * delta, 0.2), 5);
  }

  /** 重置视角 */
  function handleReset() {
    transformRef.current = { x: 0, y: 0, scale: 1 };
  }

  /** 导航到反链中的 chunk */
  function handleNavigateToChunk(chunkId: string) {
    const node = graphData?.nodes?.find((n) => n.id === chunkId) ?? null;
    if (node) {
      setInteraction({ ...interaction, selectedNode: node });
    }
  }

  if (graphLoading || !d3Ready) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!graphData || graphData.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        暂无知识图谱数据，请先上传文档
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative flex h-full">
      {/* 图谱主区域 */}
      <div className="relative flex-1">
        <canvas
          ref={canvasRef}
          className="h-full w-full cursor-pointer"
          onClick={handleCanvasClick}
          onMouseMove={handleMouseMove}
          onWheel={handleWheel}
        />

        {/* 控制栏 */}
        <div className="absolute left-4 right-4 top-4">
          <GraphControls
            minSimilarity={minSimilarity}
            selectedDocIds={selectedDocIds}
            onSimilarityChange={setMinSimilarity}
            onDocFilterChange={setSelectedDocIds}
            onReset={handleReset}
            onRebuild={() => rebuildMutation.mutate()}
            isRebuilding={rebuildMutation.isPending}
          />
        </div>
      </div>

      {/* 节点详情侧面板 */}
      {interaction.selectedNode && (
        <div className="w-80 shrink-0">
          <GraphNodeDetail
            node={interaction.selectedNode}
            backlinks={backlinksData?.backlinks}
            backlinksLoading={backlinksLoading}
            onClose={() => {
              setInteraction({ ...interaction, selectedNode: null });
            }}
            onNavigateToChunk={handleNavigateToChunk}
          />
        </div>
      )}
    </div>
  );
}
