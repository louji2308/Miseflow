/** REST: nothing moves; the resting food breathes with a subtle warm glow pulse for the step's duration. */
import { CookAction, CookActionContext } from "./CookActionKit";

export const RestAction: CookAction = {
  name: "REST",
  run: async (ctx: CookActionContext) => {
    const items = ctx.items.length > 0 ? ctx.items : [];
    ctx.onCleanup(() => {
      for (const it of items) ctx.state.setGlow(it.id, 0);
    });
    const D = Math.max(1, ctx.dur);
    const pulses = Math.max(1, Math.round(D / 1.6));
    await ctx.tween(D, (k) => {
      const g = 0.14 * Math.pow(Math.sin(Math.PI * k * pulses), 2);
      for (const it of items) ctx.state.setGlow(it.id, g);
    });
    for (const it of items) ctx.state.setGlow(it.id, 0);
  },
};
