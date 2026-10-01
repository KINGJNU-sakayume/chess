import { stackedName } from '../../engine/rules/num';
import { upgradeDef } from '../../engine/rules/registry';
import type { RunState } from '../../engine/run/types';
import { RARITY_STYLE } from '../../components/run/rarity';

/** Compact list of owned upgrades with stack numerals. */
export function BuildSummary({ run }: { run: RunState }) {
  if (!run.upgrades.length) return <div className="panel p-4 text-sm text-ink-400">No upgrades — orthodox chess.</div>;
  return (
    <div className="panel flex flex-wrap gap-1.5 p-4">
      {run.upgrades.map((u) => {
        const def = upgradeDef(u.id);
        return (
          <span key={u.id} title={def.describe(u.stacks)} className={`rounded-md bg-ink-800 px-2 py-1 text-xs ${RARITY_STYLE[def.rarity].text}`}>
            {stackedName(def.name, u.stacks)}
          </span>
        );
      })}
    </div>
  );
}
