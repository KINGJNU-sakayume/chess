import { fileOf, rankOf, sqOf, type Sq } from '../../engine/core/coords';
import type { PieceType } from '../../engine/core/pieces';
import type { EnemyPieceSpec, PieceTag, Terrain } from '../../engine/core/state';
import type { TemplateContext } from '../../engine/encounters/templates';
import type { Rng } from '../../engine/rng/rng';

/** Placement helpers shared by encounter templates. */
export class Placer {
  readonly used = new Set<Sq>();
  readonly enemies: EnemyPieceSpec[] = [];
  readonly terrain: { sq: Sq; type: Terrain }[] = [];

  constructor(
    readonly ctx: TemplateContext,
    readonly rng: Rng = ctx.rng,
  ) {
    for (const sq of ctx.occupied) this.used.add(sq);
  }

  free(sq: Sq): boolean {
    return sq >= 0 && sq < 64 && !this.used.has(sq);
  }

  region(files: [number, number], ranks: [number, number]): Sq[] {
    const out: Sq[] = [];
    for (let r = ranks[0]; r <= ranks[1]; r++) {
      for (let f = files[0]; f <= files[1]; f++) {
        const sq = sqOf(f, r);
        if (this.free(sq)) out.push(sq);
      }
    }
    return out;
  }

  put(type: PieceType, sq: Sq, tags?: PieceTag[], wards?: number): boolean {
    if (!this.free(sq)) return false;
    this.used.add(sq);
    this.enemies.push({ type, sq, tags, wards });
    return true;
  }

  /** Place `type` on a random free square of `candidates`. */
  putIn(type: PieceType, candidates: Sq[], tags?: PieceTag[]): Sq | null {
    const free = candidates.filter((sq) => this.free(sq));
    if (!free.length) return null;
    const sq = this.rng.pick(free);
    this.put(type, sq, tags);
    return sq;
  }

  wall(sq: Sq, type: Terrain = 'WALL'): boolean {
    if (!this.free(sq) || rankOf(sq) <= this.ctx.deploymentTop) return false;
    this.used.add(sq);
    this.terrain.push({ sq, type });
    return true;
  }

  /** Scatter a few rubble squares in the middle of the board. */
  scatterRubble(count: number): void {
    const mid = this.region([0, 7], [Math.max(2, this.ctx.deploymentTop + 1), 4]);
    for (let i = 0; i < count && mid.length; i++) {
      const sq = mid.splice(this.rng.int(mid.length), 1)[0];
      this.wall(sq, 'RUBBLE');
    }
  }
}

export const clampFile = (f: number): number => Math.max(0, Math.min(7, f));

export function nearFiles(center: number, spread: number): [number, number] {
  return [clampFile(center - spread), clampFile(center + spread)];
}

export const sqFile = fileOf;
export const sqRank = rankOf;

/** Turn limit from the act range, nudged by difficulty. */
export function turnLimitFor(ctx: TemplateContext, range: [number, number], bonus = 0): number {
  return ctx.rng.range(range[0], range[1]) + bonus;
}
