import type { Sq } from '../core/coords';
import type { PieceType } from '../core/pieces';
import type {
  BehaviorProfile,
  EnemyPieceSpec,
  ObjectiveConfig,
  ObjectiveType,
  PieceTag,
  ReinforcementWave,
  SquareMark,
  Terrain,
} from '../core/state';
import type { Rng } from '../rng/rng';

/**
 * Encounter templates (D7). Encounters are generated procedurally from these
 * — never hand-authored puzzles — and then validated. Each template also has a
 * `safe` variant: a conservative layout used when generation keeps failing.
 */
export interface TemplateContext {
  rng: Rng;
  act: number;
  kind: 'combat' | 'elite' | 'boss';
  /** 0..1 progression inside the act (0 = first fight). */
  difficulty: number;
  /** Squares holding player pieces (templates must not place enemies there). */
  occupied: ReadonlySet<Sq>;
  /** Highest rank index the player may deploy to (1 = ranks 1–2). */
  deploymentTop: number;
}

export interface TemplateOutput {
  name: string;
  objective: ObjectiveConfig;
  turnLimit: number | null;
  enemyActions: number;
  profile: BehaviorProfile;
  enemies: EnemyPieceSpec[];
  terrain: { sq: Sq; type: Terrain }[];
  waves: ReinforcementWave[];
  /** Player roster tags (e.g. ESCAPE designates one piece). */
  designate?: { prefer: PieceType[]; tag: PieceTag };
  marks?: Omit<SquareMark, 'id'>[];
  bossId?: string;
}

export interface EncounterTemplate {
  id: string;
  name: string;
  objective: ObjectiveType;
  /** Short description shown on the map. */
  blurb: string;
  acts: number[];
  weight: number;
  generate: (ctx: TemplateContext) => TemplateOutput;
  safe: (ctx: TemplateContext) => TemplateOutput;
}
