import { randomUUID } from "node:crypto";
import {
  queueRushGameSchema,
  type QueueRushDifficulty,
  type QueueRushGameView,
} from "@ticketsprint/contracts/queue-rush";
import {
  abandonQueueRushCheckout,
  advanceQueueRush,
  createQueueRushGame,
  holdQueueRushSeats,
  payQueueRush,
  queueRushDrops,
  queueRushGameView,
  QueueRushRuleError,
} from "@ticketsprint/simulation-engine";

type Options = { now?: () => number; seed?: () => string; maxGames?: number };
type Entry = {
  game: ReturnType<typeof createQueueRushGame>;
  lastSeenAtMs: number;
};

export class QueueRushService {
  private readonly games = new Map<string, Entry>();
  private readonly now: () => number;
  private readonly seed: () => string;
  private readonly maxGames: number;

  constructor(options: Options = {}) {
    this.now = options.now ?? Date.now;
    this.seed = options.seed ?? randomUUID;
    this.maxGames = options.maxGames ?? 5_000;
  }

  listDrops() {
    return queueRushDrops;
  }

  private cleanup(nowMs: number) {
    for (const [id, entry] of this.games) {
      const ttl =
        entry.game.stage === "WON" || entry.game.stage === "LOST"
          ? 15 * 60_000
          : 2 * 60 * 60_000;
      if (nowMs - entry.lastSeenAtMs > ttl) this.games.delete(id);
    }
    if (this.games.size >= this.maxGames) {
      const firstId = this.games.keys().next().value as string | undefined;
      if (firstId) this.games.delete(firstId);
    }
  }

  private advance(id: string) {
    const entry = this.games.get(id);
    if (!entry)
      throw new QueueRushRuleError(
        404,
        "GAME_NOT_FOUND",
        "This practice game is no longer available. Start a new drop.",
      );
    const nowMs = this.now();
    entry.game = advanceQueueRush(entry.game, nowMs);
    entry.lastSeenAtMs = nowMs;
    return { entry, nowMs };
  }

  create(input: {
    dropSlug: string;
    difficulty: QueueRushDifficulty;
  }): QueueRushGameView {
    const nowMs = this.now();
    this.cleanup(nowMs);
    const id = randomUUID();
    const game = createQueueRushGame({
      id,
      dropSlug: input.dropSlug,
      difficulty: input.difficulty,
      seed: this.seed(),
      nowMs,
    });
    const entry = { game, lastSeenAtMs: nowMs };
    this.games.set(id, entry);
    return queueRushGameSchema.parse(queueRushGameView(game, nowMs));
  }

  get(id: string): QueueRushGameView {
    const { entry, nowMs } = this.advance(id);
    return queueRushGameSchema.parse(queueRushGameView(entry.game, nowMs));
  }

  hold(id: string, seatIds: string[]): QueueRushGameView {
    const { entry, nowMs } = this.advance(id);
    entry.game = holdQueueRushSeats(entry.game, seatIds, nowMs);
    return queueRushGameSchema.parse(queueRushGameView(entry.game, nowMs));
  }

  abandon(id: string): QueueRushGameView {
    const { entry, nowMs } = this.advance(id);
    entry.game = abandonQueueRushCheckout(entry.game, nowMs);
    return queueRushGameSchema.parse(queueRushGameView(entry.game, nowMs));
  }

  pay(id: string): { game: QueueRushGameView; duplicate: boolean } {
    const { entry, nowMs } = this.advance(id);
    const result = payQueueRush(entry.game, nowMs);
    entry.game = result.game;
    return {
      game: queueRushGameSchema.parse(queueRushGameView(entry.game, nowMs)),
      duplicate: result.duplicate,
    };
  }
}
