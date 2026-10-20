import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { CONFIG } from '../config.js';
import { SongRepo } from '../db/repositories/songRepo.js';
import { PlayerRepo } from '../db/repositories/playerRepo.js';
import { RoomRepo } from '../db/repositories/roomRepo.js';
import { Song, PublicSong } from '../types/index.js';

export class SongService {
  private songRepo: SongRepo;
  private playerRepo: PlayerRepo;
  private roomRepo: RoomRepo;
  private uploadsDir: string;

  constructor(
    songRepo?: SongRepo,
    playerRepo?: PlayerRepo,
    roomRepo?: RoomRepo,
    uploadsDir: string = CONFIG.UPLOADS_DIR
  ) {
    this.songRepo = songRepo || new SongRepo();
    this.playerRepo = playerRepo || new PlayerRepo();
    this.roomRepo = roomRepo || new RoomRepo();
    this.uploadsDir = uploadsDir;

    if (!fs.existsSync(this.uploadsDir)) {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
    }
  }

  validateFile(originalName: string, mimeType: string, sizeBytes: number): string {
    if (sizeBytes > CONFIG.MAX_FILE_SIZE_BYTES) {
      throw new Error(`File is too large (${(sizeBytes / (1024 * 1024)).toFixed(1)} MB). Maximum allowed size is 20 MB.`);
    }

    const ext = path.extname(originalName).toLowerCase();
    if (!CONFIG.ALLOWED_EXTENSIONS.includes(ext)) {
      throw new Error(`Invalid file format "${ext}". Supported formats: MP3, WAV, OGG, M4A, AAC.`);
    }

    const cleanMime = mimeType.toLowerCase();
    const isMimeAllowed = CONFIG.ALLOWED_MIME_TYPES.some((allowed) =>
      cleanMime.includes(allowed) || cleanMime.startsWith('audio/')
    );

    if (!isMimeAllowed) {
      throw new Error(`Invalid audio MIME type: ${mimeType}.`);
    }

    return ext;
  }

  saveSongFile(
    sessionToken: string,
    fileBuffer: Buffer,
    originalName: string,
    mimeType: string,
    estimatedDuration = 30,
    title?: string,
    artist?: string
  ): Song {
    const player = this.playerRepo.getPlayerByToken(sessionToken);
    if (!player) throw new Error('Unauthorized session.');

    const room = this.roomRepo.getRoomByCode(player.room_code);
    if (!room) throw new Error('Room not found.');
    if (room.status !== 'lobby') {
      throw new Error('Cannot upload songs once the game has started.');
    }

    const existingSongs = this.songRepo.getSongsByUploader(player.id);
    if (existingSongs.length >= CONFIG.MAX_SONGS_PER_PLAYER) {
      throw new Error(`You have reached the maximum of ${CONFIG.MAX_SONGS_PER_PLAYER} songs.`);
    }

    const ext = this.validateFile(originalName, mimeType, fileBuffer.length);

    // Sanitize original filename (strip directory components, truncate)
    const baseOriginalName = path.basename(originalName).replace(/[^\w\s.-]/g, '_').slice(0, 100);

    // Default title from filename if not explicitly provided
    const defaultTitle = title?.trim() || path.parse(baseOriginalName).name.replace(/[_-]/g, ' ').trim();
    const cleanArtist = artist?.trim() || null;

    // Generate safe, unique stored filename
    const songId = uuidv4();
    const storedFilename = `${songId}${ext}`;
    const destinationPath = path.join(this.uploadsDir, storedFilename);

    // Save to disk
    fs.writeFileSync(destinationPath, fileBuffer);

    // Record in DB
    const song = this.songRepo.createSong(
      songId,
      room.code,
      player.id,
      baseOriginalName,
      storedFilename,
      fileBuffer.length,
      mimeType,
      estimatedDuration,
      defaultTitle,
      cleanArtist,
      'upload'
    );

    return song;
  }

  addJamendoSong(
    sessionToken: string,
    trackData: {
      trackId: string;
      title: string;
      artist: string;
      duration: number;
      audioUrl: string;
      artworkUrl?: string | null;
    }
  ): Song {
    const player = this.playerRepo.getPlayerByToken(sessionToken);
    if (!player) throw new Error('Unauthorized session.');

    const room = this.roomRepo.getRoomByCode(player.room_code);
    if (!room) throw new Error('Room not found.');
    if (room.status !== 'lobby') {
      throw new Error('Cannot add songs once the game has started.');
    }

    const existingSongs = this.songRepo.getSongsByUploader(player.id);
    if (existingSongs.length >= CONFIG.MAX_SONGS_PER_PLAYER) {
      throw new Error(`You have reached the maximum of ${CONFIG.MAX_SONGS_PER_PLAYER} songs.`);
    }

    if (!trackData.trackId || !String(trackData.trackId).trim()) {
      throw new Error('Jamendo track ID is required.');
    }

    const title = (trackData.title || '').trim();
    if (!title) {
      throw new Error('Track title is required.');
    }

    const artist = (trackData.artist || 'Unknown Artist').trim();
    const audioUrl = (trackData.audioUrl || '').trim();
    if (!audioUrl || (!audioUrl.startsWith('https://') && !audioUrl.startsWith('http://'))) {
      throw new Error('A valid Jamendo audio streaming URL is required.');
    }

    // Check if this track is already added to this room
    if (this.songRepo.hasExternalSongInRoom(room.code, String(trackData.trackId).trim())) {
      throw new Error('This track has already been added to the room.');
    }

    const songId = uuidv4();
    const durationSeconds = Math.max(5, Math.min(600, Math.round(trackData.duration || 30)));
    const storedFilename = `jamendo_${String(trackData.trackId).trim()}_${songId.slice(0, 8)}`;
    const originalFilename = `${title}.mp3`;

    const song = this.songRepo.createSong(
      songId,
      room.code,
      player.id,
      originalFilename,
      storedFilename,
      0,
      'audio/mpeg',
      durationSeconds,
      title,
      artist,
      'jamendo',
      String(trackData.trackId).trim(),
      audioUrl,
      trackData.artworkUrl || null
    );

    return song;
  }

  addYouTubeSong(
    sessionToken: string,
    videoData: {
      videoId: string;
      title: string;
      duration?: string | number;
      thumbnail?: string | null;
    }
  ): Song {
    const player = this.playerRepo.getPlayerByToken(sessionToken);
    if (!player) throw new Error('Unauthorized session.');

    const room = this.roomRepo.getRoomByCode(player.room_code);
    if (!room) throw new Error('Room not found.');
    if (room.status !== 'lobby') {
      throw new Error('Cannot add songs once the game has started.');
    }

    const existingSongs = this.songRepo.getSongsByUploader(player.id);
    if (existingSongs.length >= CONFIG.MAX_SONGS_PER_PLAYER) {
      throw new Error(`You have reached the maximum of ${CONFIG.MAX_SONGS_PER_PLAYER} songs.`);
    }

    const cleanVideoId = (videoData.videoId || '').trim();
    if (!cleanVideoId) {
      throw new Error('YouTube videoId is required.');
    }

    const title = (videoData.title || '').trim();
    if (!title) {
      throw new Error('Video title is required.');
    }

    // Check if this video is already in this room
    if (this.songRepo.hasExternalSongInRoom(room.code, cleanVideoId)) {
      throw new Error('This YouTube video has already been added to the room.');
    }

    // Parse duration (e.g., "3:45", seconds number, etc.)
    let durationSeconds = 30;
    if (typeof videoData.duration === 'number' && videoData.duration > 0) {
      durationSeconds = Math.max(5, Math.min(600, Math.round(videoData.duration)));
    } else if (typeof videoData.duration === 'string' && videoData.duration.trim()) {
      const parts = videoData.duration.trim().split(':').map((p) => parseInt(p, 10));
      if (parts.every((p) => !isNaN(p))) {
        let total = 0;
        if (parts.length === 3) {
          total = parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
          total = parts[0] * 60 + parts[1];
        } else if (parts.length === 1) {
          total = parts[0];
        }
        if (total > 0) {
          durationSeconds = Math.max(5, Math.min(600, total));
        }
      }
    }

    const songId = uuidv4();
    const storedFilename = `youtube_${cleanVideoId}_${songId.slice(0, 8)}`;
    const originalFilename = `${title}`;
    const externalUrl = `https://www.youtube.com/watch?v=${cleanVideoId}`;
    const artworkUrl = videoData.thumbnail || `https://i.ytimg.com/vi/${cleanVideoId}/hqdefault.jpg`;

    const song = this.songRepo.createSong(
      songId,
      room.code,
      player.id,
      originalFilename,
      storedFilename,
      0,
      'video/mp4',
      durationSeconds,
      title,
      'YouTube',
      'youtube',
      cleanVideoId,
      externalUrl,
      artworkUrl
    );

    return song;
  }

  deleteSong(sessionToken: string, songId: string): void {
    const player = this.playerRepo.getPlayerByToken(sessionToken);
    if (!player) throw new Error('Unauthorized session.');

    const room = this.roomRepo.getRoomByCode(player.room_code);
    if (!room) throw new Error('Room not found.');
    if (room.status !== 'lobby') {
      throw new Error('Cannot delete songs once the game has started.');
    }

    const song = this.songRepo.getSongById(songId);
    if (!song) throw new Error('Song not found.');

    if (song.uploader_player_id !== player.id && !player.is_host) {
      throw new Error('You do not have permission to delete this song.');
    }

    this.songRepo.deleteSong(songId);

    // Remove from disk if it was an uploaded file
    if (song.source_type === 'upload') {
      const filePath = path.join(this.uploadsDir, song.stored_filename);
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          console.error(`Failed to delete song file: ${filePath}`, err);
        }
      }
    }
  }

  getSongForPlayback(
    sessionToken: string,
    roomCode: string,
    songId: string
  ): {
    song: Song;
    isExternal: boolean;
    filePath?: string;
    externalUrl?: string;
    mimeType: string;
  } {
    const player = this.playerRepo.getPlayerByToken(sessionToken);
    if (!player) throw new Error('Unauthorized session.');

    if (player.room_code.toUpperCase() !== roomCode.toUpperCase()) {
      throw new Error('Access denied: You are not a member of this room.');
    }

    const song = this.songRepo.getSongById(songId);
    if (!song || song.room_code.toUpperCase() !== roomCode.toUpperCase()) {
      throw new Error('Song not found in this room.');
    }

    // In lobby or finished, only uploader can preview their own audio, OR if game is playing
    const room = this.roomRepo.getRoomByCode(roomCode);
    if (room?.status === 'lobby' && song.uploader_player_id !== player.id && !player.is_host) {
      throw new Error('Preview only available for your own tracks.');
    }

    if (song.source_type === 'jamendo' || song.source_type === 'youtube') {
      return {
        song,
        isExternal: true,
        externalUrl: song.external_url || '',
        mimeType: song.mime_type || (song.source_type === 'youtube' ? 'video/mp4' : 'audio/mpeg')
      };
    }

    const safeFilePath = path.join(this.uploadsDir, song.stored_filename);
    if (!fs.existsSync(safeFilePath)) {
      throw new Error('Song audio file does not exist on server.');
    }

    return {
      song,
      isExternal: false,
      filePath: safeFilePath,
      mimeType: song.mime_type || 'audio/mpeg'
    };
  }

  getSongFilePathForPlayback(sessionToken: string, roomCode: string, songId: string): { filePath: string; mimeType: string } {
    const info = this.getSongForPlayback(sessionToken, roomCode, songId);
    if (info.isExternal || !info.filePath) {
      throw new Error('This track is streamed from an external source (Jamendo), not stored as a local file.');
    }
    return { filePath: info.filePath, mimeType: info.mimeType };
  }

  /**
   * Returns list of songs for a room.
   * If requesterPlayerId is provided, masks title/artist of songs uploaded by others
   * when in "guess_song" mode to prevent inspection of secret answers before game start.
   */
  getRoomSongs(roomCode: string, requesterPlayerId?: string): PublicSong[] {
    const rawSongs = this.songRepo.getPublicSongsInRoom(roomCode);
    const room = this.roomRepo.getRoomByCode(roomCode);
    const isGuessMode = room?.game_mode === 'guess_song';

    return rawSongs.map((s) => {
      const isUploader = requesterPlayerId && s.uploader_player_id === requesterPlayerId;
      if (isGuessMode && !isUploader) {
        return {
          id: s.id,
          original_filename: 'Hidden Audio Track',
          file_size: s.file_size,
          uploader_player_id: s.uploader_player_id,
          uploader_nickname: s.uploader_nickname,
          source_type: s.source_type,
          duration_seconds: s.duration_seconds
        };
      }
      return s;
    });
  }

  getSongById(songId: string): Song | null {
    return this.songRepo.getSongById(songId);
  }
}
