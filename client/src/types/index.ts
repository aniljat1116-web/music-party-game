export type RoomStatus = 'lobby' | 'playing' | 'finished';
export type GamePhase = 'playing' | 'discussing' | 'voting' | 'revealed';
export type GameMode = 'who_added' | 'guess_song';
export type SongSourceType = 'upload' | 'jamendo' | 'youtube' | 'agent_download';

export type AgentDownloadPhase =
  | 'queued'
  | 'validating'
  | 'launching_browser'
  | 'navigating'
  | 'submitting_url'
  | 'processing'
  | 'downloading'
  | 'verifying'
  | 'completed'
  | 'error';

export interface AgentDownloadProgressEvent {
  jobId: string;
  roomCode?: string;
  status: AgentDownloadPhase;
  percent: number;
  message: string;
  data?: any;
  result?: any;
  error?: string | null;
}

export interface YouTubeSearchResult {
  videoId: string;
  title: string;
  thumbnail: string;
  duration: string;
}

export interface Room {
  code: string;
  host_player_id: string;
  status: RoomStatus;
  current_round: number;
  total_rounds: number;
  discussion_duration: number;
  game_mode: GameMode;
  clip_duration: number;
  created_at: number;
  updated_at: number;
}

export interface Player {
  id: string;
  nickname: string;
  is_host: boolean;
  is_ready: boolean;
  score: number;
  connected: boolean;
}

export interface Song {
  id: string;
  original_filename: string;
  file_size: number;
  uploader_player_id: string;
  uploader_nickname?: string;
  title?: string;
  artist?: string;
  source_type?: SongSourceType;
  external_id?: string | null;
  artwork_url?: string | null;
  duration_seconds?: number;
}

export interface JamendoTrackResult {
  id: string;
  title: string;
  artist: string;
  duration: number;
  artwork_url: string | null;
  audio_url: string;
  playable: boolean;
  license_ccurl?: string;
}

export interface PublicVoteResult {
  voter_id: string;
  voter_nickname: string;
  voted_id?: string;
  voted_nickname?: string;
  guess_title?: string;
  guess_artist?: string;
  points_awarded: number;
  is_correct: boolean;
  is_skipped: boolean;
}

export interface RoundResultData {
  round_number: number;
  song_id: string;
  song_title: string;
  artist?: string;
  artwork_url?: string | null;
  uploader_id: string;
  uploader_nickname: string;
  votes: PublicVoteResult[];
  scores: Array<{ player_id: string; nickname: string; score: number; points_earned: number }>;
}

export interface FinalRanking {
  rank: number;
  player_id: string;
  nickname: string;
  score: number;
  is_winner: boolean;
}

export interface GameStatePayload {
  room_code: string;
  round_id?: string;
  status: RoomStatus;
  game_mode: GameMode;
  clip_duration: number;
  current_round: number;
  total_rounds: number;
  discussion_duration: number;
  phase: GamePhase | null;
  phase_ends_at: number | null;
  playback_start_time: number | null;
  current_song?: {
    id: string;
    original_filename: string;
    duration_seconds: number;
    source_type?: SongSourceType;
    external_id?: string | null;
    artwork_url?: string | null;
    uploader_id?: string;
    uploader_nickname?: string;
    title?: string;
    artist?: string;
  } | null;
  is_my_song?: boolean;
  has_voted?: boolean;
  has_skipped_vote?: boolean;
  votes_submitted_count?: number;
  total_eligible_voters?: number;
  discussion_skips_count?: number;
  total_discussion_eligible?: number;
  has_skipped_discussion?: boolean;
  round_result?: RoundResultData | null;
  final_rankings?: FinalRanking[] | null;
}

export interface ChatMessage {
  id: string;
  room_code: string;
  player_id: string;
  nickname: string;
  message: string;
  created_at: number;
}

export interface ReactionEvent {
  id: string;
  player_id: string;
  nickname: string;
  emoji: string;
  timestamp: number;
}

export type ToastType = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
}
