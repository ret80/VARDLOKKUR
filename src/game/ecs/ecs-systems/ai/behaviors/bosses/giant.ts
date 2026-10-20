/* giant.ts — босс «Великан»: enter → chase → wind → swing → stuck (2-я фаза при HP ≤ 50%).
 *
 * Удар косой не наносит урона (swingContact: null) — как в оригинале.
 */

import { SwingBossBrain } from './swing-boss';

export class GiantBrain extends SwingBossBrain {
  constructor() {
    super({
      phase2Speed: 58,
      chaseTime: [2.0, 2.0],
      lungeTriggerDist: 34,
      windTime: [0.62, 0.4],
      swingTime: 0.3,
      stuckTime: [1.7, 1.1],
      swingContact: null,
      swingSound: false,
    });
  }
}
