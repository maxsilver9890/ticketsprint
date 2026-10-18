export type RedisReply =
  string | number | boolean | Array<string | number | boolean>;
export interface RedisConnection {
  sendCommand(args: readonly string[]): Promise<unknown>;
  ping(): Promise<string>;
}
export function sendRedisCommand(
  client: RedisConnection,
  ...args: string[]
): Promise<RedisReply> {
  return client.sendCommand(args) as Promise<RedisReply>;
}
