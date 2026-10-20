/* reaper.ts — босс «Жнец»: enter → chase → wind → swing → stuck (2-я фаза при HP ≤ 50%). */

import { SwingBossBrain } from './swing-boss';

export class ReaperBrain extends SwingBossBrain {
  constructor() {
    super({
      phase2Speed: 72,
      chaseTime: [2.2, 1.4],
      lungeTriggerDist: 30,
      windTime: [0.6, 0.42],
      swingTime: 0.26,
      stuckTime: [1.8, 1.25],
      swingContact: { dmg: 2, radius: 40, cooldown: 0.6 },
      swingSound: true,
    });
  }
}
