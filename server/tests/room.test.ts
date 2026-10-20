import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestContext } from './setup.js';

describe('Room & Player Management', () => {
  let ctx: ReturnType<typeof createTestContext>;

  beforeEach(() => {
    ctx = createTestContext('test-room-uploads');
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it('creates a room with a 6-character code and assigns host', () => {
    const { room, host, sessionToken } = ctx.roomService.createRoom('HostAlice', 30, 5);

    expect(room.code).toBeDefined();
    expect(room.code.length).toBe(6);
    expect(room.status).toBe('lobby');
    expect(room.total_rounds).toBe(5);
    expect(room.discussion_duration).toBe(30);

    expect(host.nickname).toBe('HostAlice');
    expect(host.is_host).toBe(1);
    expect(sessionToken).toBeDefined();
  });

  it('enforces maximum 10 players per room', () => {
    const { room } = ctx.roomService.createRoom('Host', 30, 5);

    // Join 9 more players (total 10)
    for (let i = 2; i <= 10; i++) {
      const res = ctx.roomService.joinRoom(room.code, `Player_${i}`);
      expect(res.player).toBeDefined();
    }

    // 11th player should be rejected
    expect(() => {
      ctx.roomService.joinRoom(room.code, 'Player_11');
    }).toThrow(/Room is full/);
  });

  it('enforces host permissions for updating settings', () => {
    const { room, sessionToken: hostToken } = ctx.roomService.createRoom('Host', 30, 5);
    const { sessionToken: playerToken } = ctx.roomService.joinRoom(room.code, 'Guest');

    // Host can update
    const updated = ctx.roomService.updateRoomSettings(hostToken, 8, 45);
    expect(updated.room.total_rounds).toBe(8);
    expect(updated.room.discussion_duration).toBe(45);

    // Non-host is rejected
    expect(() => {
      ctx.roomService.updateRoomSettings(playerToken, 10, 60);
    }).toThrow(/Only the room leader can update settings/);
  });

  it('rejects joining a game that is already playing', () => {
    const { room } = ctx.roomService.createRoom('Host', 30, 5);
    ctx.roomRepo.updateRoomStatus(room.code, 'playing');

    expect(() => {
      ctx.roomService.joinRoom(room.code, 'LatePlayer');
    }).toThrow(/Cannot join: This game is already in progress/);
  });
});
