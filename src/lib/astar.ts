import { Point } from '../store';
import { calculateDistance } from './utils';

interface GridNode {
  x: number;
  y: number;
  lat: number;
  lng: number;
  walkable: boolean;
  g: number;
  h: number;
  f: number;
  parent: GridNode | null;
}

// A simple A* implementation over a grid generated from the bounding box of historical points
export function findShortcutAStar(start: Point, end: Point, historyPoints: Point[]): Point[] {
  if (historyPoints.length < 2) return [start, end];

  // 1. Find bounding box
  let minLat = start.lat, maxLat = start.lat;
  let minLng = start.lng, maxLng = start.lng;

  for (const p of historyPoints) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }
  
  if (end.lat < minLat) minLat = end.lat;
  if (end.lat > maxLat) maxLat = end.lat;
  if (end.lng < minLng) minLng = end.lng;
  if (end.lng > maxLng) maxLng = end.lng;

  // Add padding
  const padLat = (maxLat - minLat) * 0.1 || 0.001;
  const padLng = (maxLng - minLng) * 0.1 || 0.001;
  minLat -= padLat; maxLat += padLat;
  minLng -= padLng; maxLng += padLng;

  // 2. Create Grid (e.g., 20x20)
  const GRID_SIZE = 20;
  const latStep = (maxLat - minLat) / GRID_SIZE;
  const lngStep = (maxLng - minLng) / GRID_SIZE;

  const grid: GridNode[][] = [];
  for (let x = 0; x < GRID_SIZE; x++) {
    grid[x] = [];
    for (let y = 0; y < GRID_SIZE; y++) {
      grid[x][y] = {
        x, y,
        lat: minLat + x * latStep,
        lng: minLng + y * lngStep,
        walkable: true, // In a real scenario, we'd use elevation/terrain to determine walkability
        g: 0, h: 0, f: 0,
        parent: null
      };
    }
  }

  // Mark areas near risk points as non-walkable
  for (const p of historyPoints) {
    if (p.risk) {
      const x = Math.floor((p.lat - minLat) / latStep);
      const y = Math.floor((p.lng - minLng) / lngStep);
      if (x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE) {
        grid[x][y].walkable = false;
        // Mark neighbors as non-walkable too for safety margin
        if(x>0) grid[x-1][y].walkable = false;
        if(x<GRID_SIZE-1) grid[x+1][y].walkable = false;
        if(y>0) grid[x][y-1].walkable = false;
        if(y<GRID_SIZE-1) grid[x][y+1].walkable = false;
      }
    }
  }

  const startX = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor((start.lat - minLat) / latStep)));
  const startY = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor((start.lng - minLng) / lngStep)));
  const endX = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor((end.lat - minLat) / latStep)));
  const endY = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor((end.lng - minLng) / lngStep)));

  const startNode = grid[startX][startY];
  const endNode = grid[endX][endY];
  
  // Ensure start and end are walkable
  startNode.walkable = true;
  endNode.walkable = true;

  const openList: GridNode[] = [startNode];
  const closedList: Set<GridNode> = new Set();

  while (openList.length > 0) {
    // Get node with lowest f
    let lowestIndex = 0;
    for (let i = 1; i < openList.length; i++) {
      if (openList[i].f < openList[lowestIndex].f) {
        lowestIndex = i;
      }
    }
    const currentNode = openList[lowestIndex];

    // Reached end?
    if (currentNode === endNode) {
      const path: Point[] = [];
      let curr: GridNode | null = currentNode;
      while (curr) {
        path.push({ lat: curr.lat, lng: curr.lng, alt: null, time: Date.now() });
        curr = curr.parent;
      }
      return path.reverse();
    }

    openList.splice(lowestIndex, 1);
    closedList.add(currentNode);

    // Check neighbors
    const neighbors = [];
    const { x, y } = currentNode;
    if (x > 0) neighbors.push(grid[x - 1][y]);
    if (x < GRID_SIZE - 1) neighbors.push(grid[x + 1][y]);
    if (y > 0) neighbors.push(grid[x][y - 1]);
    if (y < GRID_SIZE - 1) neighbors.push(grid[x][y + 1]);
    // Diagonals
    if (x > 0 && y > 0) neighbors.push(grid[x - 1][y - 1]);
    if (x < GRID_SIZE - 1 && y < GRID_SIZE - 1) neighbors.push(grid[x + 1][y + 1]);
    if (x > 0 && y < GRID_SIZE - 1) neighbors.push(grid[x - 1][y + 1]);
    if (x < GRID_SIZE - 1 && y > 0) neighbors.push(grid[x + 1][y - 1]);

    for (const neighbor of neighbors) {
      if (!neighbor.walkable || closedList.has(neighbor)) continue;

      const gScore = currentNode.g + calculateDistance(currentNode.lat, currentNode.lng, neighbor.lat, neighbor.lng);
      let gScoreIsBest = false;

      if (!openList.includes(neighbor)) {
        gScoreIsBest = true;
        neighbor.h = calculateDistance(neighbor.lat, neighbor.lng, endNode.lat, endNode.lng);
        openList.push(neighbor);
      } else if (gScore < neighbor.g) {
        gScoreIsBest = true;
      }

      if (gScoreIsBest) {
        neighbor.parent = currentNode;
        neighbor.g = gScore;
        neighbor.f = neighbor.g + neighbor.h;
      }
    }
  }

  // Fallback if no path found
  return [start, end];
}
