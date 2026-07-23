// Host-flavored one-liners for the reveal, picked deterministically per
// question so the host screen and overlay always agree.

const wipeout = ["Total wipeout. Nobody made it.", "And… everyone's gone. Brutal."];
const bloodbath = ["Massacre.", "That one HURT.", "Carnage. Absolute carnage."];
const scratch = ["The herd thins…", "A few casualties. It gets harder.", "Some didn't make it."];
const unscathed = ["Everyone survives. Too easy?", "Not a scratch. Turning up the heat.", "All safe — for now."];

export function revealQuip(
  eliminated: number,
  remaining: number,
  questionIndex: number
): string {
  const pick = (arr: string[]) => arr[questionIndex % arr.length];
  if (remaining === 0) return pick(wipeout);
  if (eliminated === 0) return pick(unscathed);
  if (eliminated >= remaining) return pick(bloodbath);
  return pick(scratch);
}
