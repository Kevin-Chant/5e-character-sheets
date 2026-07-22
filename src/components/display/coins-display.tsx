import { CoinType, FIELD } from "src/lib/data/data-definitions";
import { useCharacter } from "src/lib/hooks/use-character";
import { useEditMode } from "src/lib/hooks/use-edit-mode";
import { charPath, updateAt } from "src/lib/cursor";
import { totalGP } from "src/lib/rules";

// Denominations shown high-to-low, the way a player counts a purse.
const COIN_ORDER: CoinType[] = [
  CoinType.PP,
  CoinType.GP,
  CoinType.EP,
  CoinType.SP,
  CoinType.CP,
];

// A compact currency strip across the top of the equipment box. Edit mode shows
// every denomination as a small typed field; play mode collapses to the coins
// you actually hold (falling back to GP) so the purse doesn't shout zeroes. The
// gold-value total sits at the end as a muted readout.
export default function CoinsDisplay() {
  const { character, dispatch } = useCharacter();
  const { editMode } = useEditMode();
  if (!character) return <></>;

  const coins = character.coins;
  const set = (type: CoinType, value: number) =>
    dispatch(updateAt(charPath(FIELD.coins).k(type), Math.max(0, value || 0)));

  const total = totalGP(coins);
  const totalLabel = total.toLocaleString(undefined, {
    maximumFractionDigits: 2,
  });

  const held = COIN_ORDER.filter((type) => (coins[type] ?? 0) > 0);
  const readonlyCoins = held.length ? held : [CoinType.GP];

  return (
    <div className="coins-strip">
      {editMode
        ? COIN_ORDER.map((type) => (
            <label className="coin-field" key={type}>
              <input
                type="number"
                min={0}
                className="coin-input"
                value={coins[type] ?? 0}
                aria-label={`${type} coins`}
                onChange={(e) => set(type, Number(e.target.value))}
              />
              <span className="coin-denom">{type}</span>
            </label>
          ))
        : readonlyCoins.map((type) => (
            <span className="coin-field readonly" key={type}>
              <span className="coin-amount">{coins[type] ?? 0}</span>
              <span className="coin-denom">{type}</span>
            </span>
          ))}
      <span className="coin-total" title="Total value in gold pieces">
        {totalLabel} gp
      </span>
    </div>
  );
}
