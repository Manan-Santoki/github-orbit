import type { GraphNode, GraphPayload } from "@github-orbit/core";

export type GraphPosition = { x: number; y: number };

type ChildDirection = "follower" | "following" | "mutual";

type ChildPlacement = {
  id: string;
  direction: ChildDirection;
};

const FULL_TURN = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

function stableHash(value: string): number {
  return [...value].reduce(
    (hash, character) => (Math.imul(hash, 31) + character.charCodeAt(0)) >>> 0,
    7,
  );
}

function randomUnit(value: string, salt: string): number {
  const hash = stableHash(`${salt}:${value}`);
  return (Math.imul(hash ^ (hash >>> 16), 0x45d9f3b) >>> 0) / 0x1_0000_0000;
}

function clusterRadius(childCount: number): number {
  return Math.max(18, Math.sqrt(Math.max(1, childCount)) * 3.2);
}

function mergeDirection(
  current: ChildDirection | undefined,
  incoming: Exclude<ChildDirection, "mutual">,
): ChildDirection {
  if (!current || current === incoming) return incoming;
  return "mutual";
}

function childGroups(data: GraphPayload, nodesById: Map<string, GraphNode>) {
  const directionsByChild = new Map<string, Map<string, ChildDirection>>();
  for (const edge of data.edges) {
    const source = nodesById.get(edge.source);
    const target = nodesById.get(edge.target);
    let parentId: string | undefined;
    let childId: string | undefined;
    let direction: Exclude<ChildDirection, "mutual"> | undefined;
    if (source?.kind === "direct" && target?.kind === "second_hop") {
      parentId = source.id;
      childId = target.id;
      direction = "following";
    } else if (source?.kind === "second_hop" && target?.kind === "direct") {
      parentId = target.id;
      childId = source.id;
      direction = "follower";
    }
    if (!parentId || !childId || !direction) continue;
    const parentDirections = directionsByChild.get(childId) ?? new Map<string, ChildDirection>();
    parentDirections.set(parentId, mergeDirection(parentDirections.get(parentId), direction));
    directionsByChild.set(childId, parentDirections);
  }

  const groups = new Map<string, ChildPlacement[]>();
  const groupedChildren = new Set<string>();
  for (const [childId, parents] of directionsByChild) {
    const [parentId, direction] = [...parents.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    )[0]!;
    const children = groups.get(parentId) ?? [];
    children.push({ id: childId, direction });
    groups.set(parentId, children);
    groupedChildren.add(childId);
  }
  for (const children of groups.values())
    children.sort((left, right) => left.id.localeCompare(right.id));
  return { groups, groupedChildren };
}

export function buildStableGraphLayout(
  data: GraphPayload,
  previous: ReadonlyMap<string, GraphPosition>,
): Map<string, GraphPosition> {
  const positions = new Map(previous);
  const nodesById = new Map(data.nodes.map((node) => [node.id, node]));
  const viewer = nodesById.get(data.center);
  if (viewer && !positions.has(viewer.id)) positions.set(viewer.id, { x: 0, y: 0 });

  const { groups, groupedChildren } = childGroups(data, nodesById);
  const directNodes = data.nodes
    .filter((node) => node.kind === "direct")
    .sort((left, right) => {
      const countDifference =
        (groups.get(right.id)?.length ?? 0) - (groups.get(left.id)?.length ?? 0);
      return countDifference || left.id.localeCompare(right.id);
    });
  const placedClusters: Array<GraphPosition & { radius: number }> = [{ x: 0, y: 0, radius: 28 }];

  directNodes.forEach((node, index) => {
    const radius = clusterRadius(groups.get(node.id)?.length ?? 0);
    const cached = positions.get(node.id);
    if (cached) {
      placedClusters.push({ ...cached, radius });
      return;
    }
    let position: GraphPosition | undefined;
    for (let attempt = 0; attempt < 800; attempt += 1) {
      const angle =
        (index + 1 + attempt * 0.73) * GOLDEN_ANGLE + randomUnit(node.id, "cluster-angle") * 0.8;
      const distance = radius + 68 + Math.sqrt(index + attempt + 1) * 52;
      const candidate = { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
      const overlaps = placedClusters.some(
        (placed) =>
          Math.hypot(candidate.x - placed.x, candidate.y - placed.y) < radius + placed.radius + 24,
      );
      if (!overlaps) {
        position = candidate;
        break;
      }
    }
    position ??= {
      x: Math.cos(index * GOLDEN_ANGLE) * (radius + 900),
      y: Math.sin(index * GOLDEN_ANGLE) * (radius + 900),
    };
    positions.set(node.id, position);
    placedClusters.push({ ...position, radius });
  });

  for (const parent of directNodes) {
    const center = positions.get(parent.id);
    const children = groups.get(parent.id) ?? [];
    if (!center || !children.length) continue;
    const radius = clusterRadius(children.length);
    const outwardAngle = Math.atan2(center.y, center.x);
    for (const child of children) {
      if (positions.has(child.id)) continue;
      const spread = (randomUnit(child.id, "child-angle") - 0.5) * Math.PI * 0.84;
      const directionAngle =
        child.direction === "following"
          ? outwardAngle - Math.PI / 2
          : child.direction === "follower"
            ? outwardAngle + Math.PI / 2
            : outwardAngle;
      const innerRadius = 12;
      const radialUnit = randomUnit(child.id, "child-radius");
      const distance = Math.sqrt(
        innerRadius * innerRadius + radialUnit * (radius * radius - innerRadius * innerRadius),
      );
      positions.set(child.id, {
        x: center.x + Math.cos(directionAngle + spread) * distance,
        y: center.y + Math.sin(directionAngle + spread) * distance,
      });
    }
  }

  const remainingNodes = data.nodes.filter(
    (node) => !positions.has(node.id) && !groupedChildren.has(node.id),
  );
  remainingNodes.forEach((node, index) => {
    const angle = randomUnit(node.id, "orphan-angle") * FULL_TURN;
    const distance = 620 + Math.sqrt(index + 1) * 16 + randomUnit(node.id, "orphan-radius") * 180;
    positions.set(node.id, { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance });
  });

  return positions;
}
