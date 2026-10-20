import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestContext } from './setup.js';

describe('Player Session & Reconnection Resilience', () => {
  let ctx: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    ctx = createTestContext('test-reconnect-uploads');
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it('allows a disconnected player to reconnect to their existing session using sessionToken', () => {
    const { room, host, sessionToken: hostToken } = ctx.roomService.createRoom('Host', 30, 3);
    const p2 = ctx.roomService.joinRoom(room.code, 'Player2');

    // Simulate disconnect
    const discResult = ctx.roomService.handlePlayerDisconnect(p2.player.id);
    expect(discResult).not.toBeNull();

    const p2AfterDisc = ctx.playerRepo.getPlayerById(p2.player.id);
    expect(p2AfterDisc?.connected).toBe(0);

    // Reconnect with same sessionToken and a new socketId
    const reconnect = ctx.roomService.handlePlayerReconnect(p2.sessionToken, 'socket_abc_999');
    expect(reconnect).not.toBeNull();
    expect(reconnect?.player.id).toBe(p2.player.id);
    expect(reconnect?.player.nickname).toBe('Player2');
    expect(reconnect?.player.connected).toBe(1);
    expect(reconnect?.room.code).toBe(room.code);
  });

  it('rejects invalid or forged session tokens', () => {
    const { room } = ctx.roomService.createRoom('Host', 30, 3);

    const auth = ctx.roomService.authenticateSession('fake-forged-token-123');
    expect(auth).toBeNull();

    const reconnect = ctx.roomService.handlePlayerReconnect('fake-forged-token-123', 'socket-fake');
    expect(reconnect).toBeNull();
  });
});
