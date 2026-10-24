import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  X,
  Search,
  Upload,
  Music,
  Play,
  Pause,
  Plus,
  Check,
  AlertTriangle,
  Loader2,
  FileAudio,
  Trash2,
  Sparkles,
  ShieldAlert,
  Download,
  Copy
} from 'lucide-react';
import { useGame } from '../context/GameContext';
import { formatTime } from '../utils/formatTime';
import type { JamendoTrackResult, Song, YouTubeSearchResult, AgentDownloadProgressEvent } from '../types';

interface AddSongModalProps {
  isOpen: boolean;
  onClose: () => void;
  mySongs: Song[];
  maxSongs?: number;
}

export const AddSongModal: React.FC<AddSongModalProps> = ({
  isOpen,
  onClose,
  mySongs,
  maxSongs = 3
}) => {
  const {
    searchJamendo,
    addJamendoSong,
    searchYouTube,
    addYouTubeSong,
    startAgentDownload,
    uploadSong,
    addToast
  } = useGame();

  const [activeTab, setActiveTab] = useState<'agent' | 'youtube' | 'jamendo' | 'upload'>('agent');

  // --- Tab 0: Agent Download State ---
  const [agentUrl, setAgentUrl] = useState('');
  const [isAgentDownloading, setIsAgentDownloading] = useState(false);
  const [agentProgress, setAgentProgress] = useState<{
    percent: number;
    status: string;
    message: string;
  } | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);

  // --- Tab 1: YouTube Search State ---
  const [ytQuery, setYtQuery] = useState('');
  const [ytResults, setYtResults] = useState<YouTubeSearchResult[]>([]);
  const [isYtSearching, setIsYtSearching] = useState(false);
  const [ytHasSearched, setYtHasSearched] = useState(false);
  const [ytError, setYtError] = useState<string | null>(null);
  const [addingYtVideoId, setAddingYtVideoId] = useState<string | null>(null);
  const [copiedYtVideoId, setCopiedYtVideoId] = useState<string | null>(null);

  // --- Tab 2: Jamendo Search State ---
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchResults, setSearchResults] = useState<JamendoTrackResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isJamendoConfigured, setIsJamendoConfigured] = useState<boolean>(true);
  const [addingTrackId, setAddingTrackId] = useState<string | null>(null);
  const [previewTrackId, setPreviewTrackId] = useState<string | null>(null);
  const [offset, setOffset] = useState<number>(0);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Hidden audio element for Jamendo preview inside modal
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // --- Tab B: Manual Upload State ---
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadArtist, setUploadArtist] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Debounce search query input (500ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 500);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Execute Jamendo search
  const executeSearch = useCallback(
    async (queryText: string, newOffset = 0, append = false) => {
      const q = queryText.trim();
      if (!q) {
        setSearchResults([]);
        setHasSearched(false);
        setSearchError(null);
        return;
      }

      if (newOffset === 0) {
        setIsSearching(true);
      } else {
        setIsLoadingMore(true);
      }
      setSearchError(null);

      const res = await searchJamendo(q, 10, newOffset);

      if (res.isConfigured !== undefined) {
        setIsJamendoConfigured(res.isConfigured);
      }

      if (res.success && res.tracks) {
        setSearchResults((prev) => (append ? [...prev, ...res.tracks!] : res.tracks!));
        setTotalCount(res.total_count || 0);
        setOffset(newOffset);
        setHasSearched(true);
      } else {
        setSearchError(res.error || 'Failed to search Jamendo tracks.');
        if (!append) setSearchResults([]);
      }

      setIsSearching(false);
      setIsLoadingMore(false);
    },
    [searchJamendo]
  );

  // Trigger search on debounced query change
  useEffect(() => {
    if (isOpen && activeTab === 'jamendo' && debouncedQuery) {
      executeSearch(debouncedQuery, 0, false);
    }
  }, [debouncedQuery, isOpen, activeTab, executeSearch]);

  // Stop preview audio when modal closes or unmounts
  useEffect(() => {
    if (!isOpen) {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.src = '';
      }
      setPreviewTrackId(null);
      setSelectedFile(null);
      setUploadError(null);
      setIsUploading(false);
      setUploadProgress(0);
      setAgentError(null);
      setIsAgentDownloading(false);
      setAgentProgress(null);
      setCopiedYtVideoId(null);
    }
  }, [isOpen]);

  const handleAgentDownloadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = agentUrl.trim();
    if (!url || isAgentDownloading) return;

    if (mySongs.length >= maxSongs) {
      setAgentError(`You have already added the maximum of ${maxSongs} songs.`);
      return;
    }

    setIsAgentDownloading(true);
    setAgentError(null);
    setAgentProgress({ percent: 5, status: 'validating', message: 'Validating YouTube link...' });

    const res = await startAgentDownload(url, (ev: AgentDownloadProgressEvent) => {
      setAgentProgress({
        percent: ev.percent,
        status: ev.status,
        message: ev.message
      });
    });

    setIsAgentDownloading(false);

    if (res.success) {
      setAgentUrl('');
      setAgentProgress(null);
      setAgentError(null);
      if (mySongs.length + 1 >= maxSongs) {
        onClose();
      }
    } else {
      setAgentError(res.error || 'Agent download failed.');
    }
  };

  // Preview track audio playback
  const handleTogglePreview = (track: JamendoTrackResult) => {
    const audio = previewAudioRef.current;
    if (!audio) return;

    if (previewTrackId === track.id) {
      audio.pause();
      setPreviewTrackId(null);
      return;
    }

    if (!track.playable || !track.audio_url) {
      addToast('Audio preview is not permitted or unavailable for this track.', 'warning');
      return;
    }

    audio.src = track.audio_url;
    audio
      .play()
      .then(() => {
        setPreviewTrackId(track.id);
      })
      .catch((e) => {
        console.warn('Preview playback failed:', e);
        setPreviewTrackId(null);
        addToast('Could not play audio preview. Check network or browser audio settings.', 'warning');
      });
  };

  // Add Jamendo track to room
  const handleAddJamendoTrack = async (track: JamendoTrackResult) => {
    if (mySongs.length >= maxSongs) {
      addToast(`You have already uploaded the maximum of ${maxSongs} songs.`, 'warning');
      return;
    }

    if (addingTrackId) return;

    setAddingTrackId(track.id);
    const res = await addJamendoSong(track);
    setAddingTrackId(null);

    if (res.success) {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
      }
      setPreviewTrackId(null);
      if (mySongs.length + 1 >= maxSongs) {
        onClose();
      }
    } else {
      addToast(res.error || 'Failed to add track.', 'error');
    }
  };

  // Check if a Jamendo track was already added in this room
  const isTrackAdded = (trackId: string, trackTitle: string) => {
    return mySongs.some(
      (s) => (s as any).external_id === trackId || s.title?.toLowerCase() === trackTitle.toLowerCase()
    );
  };

  // Handle Drag & Drop for local upload
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processSelectedFile(e.target.files[0]);
    }
    e.target.value = '';
  };

  const processSelectedFile = (file: File) => {
    setUploadError(null);

    const validExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac'];
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    const isExtensionValid = validExtensions.includes(ext);
    const isMimeValid = file.type.startsWith('audio/') || file.type.includes('mpeg') || file.type.includes('mp3');

    if (!isExtensionValid && !isMimeValid) {
      setUploadError(`Invalid file format "${ext}". Supported formats: MP3, WAV, OGG, M4A, AAC.`);
      setSelectedFile(null);
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      setUploadError(`File is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Maximum allowed size is 20 MB.`);
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    // Pre-populate clean title from filename
    const cleanBase = file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ').trim();
    setUploadTitle(cleanBase);
  };

  const handleManualUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile || isUploading) return;

    if (mySongs.length >= maxSongs) {
      setUploadError(`You have already uploaded the maximum of ${maxSongs} songs.`);
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadProgress(20);

    const progressInterval = setInterval(() => {
      setUploadProgress((p) => (p < 85 ? p + 15 : p));
    }, 200);

    const res = await uploadSong(
      selectedFile,
      uploadTitle.trim() || undefined,
      uploadArtist.trim() || undefined
    );

    clearInterval(progressInterval);
    setUploadProgress(100);

    if (res.success) {
      setSelectedFile(null);
      setUploadTitle('');
      setUploadArtist('');
      setIsUploading(false);
      setUploadProgress(0);
      if (mySongs.length + 1 >= maxSongs) {
        onClose();
      }
    } else {
      setIsUploading(false);
      setUploadProgress(0);
      setUploadError(res.error || 'Failed to upload audio file.');
    }
  };

  const isVideoAdded = (videoId: string) => {
    return mySongs.some((s) => s.external_id === videoId);
  };

  const handleYtSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const query = ytQuery.trim();
    if (!query) {
      setYtError('Please enter a song name or artist.');
      return;
    }

    setIsYtSearching(true);
    setYtError(null);

    const res = await searchYouTube(query);
    setIsYtSearching(false);
    setYtHasSearched(true);

    if (res.success && res.results) {
      setYtResults(res.results);
    } else {
      const err = res.error || 'YouTube search failed. Please try another query.';
      setYtError(err);
      addToast(err, 'error');
    }
  };

  const handleAddYouTubeSong = async (item: YouTubeSearchResult) => {
    if (addingYtVideoId || mySongs.length >= maxSongs) return;

    setAddingYtVideoId(item.videoId);
    const res = await addYouTubeSong({
      videoId: item.videoId,
      title: item.title,
      duration: item.duration,
      thumbnail: item.thumbnail
    });

    setAddingYtVideoId(null);

    if (res.success) {
      // Clear the search results after a successful addition
      setYtResults([]);
      setYtQuery('');
      setYtHasSearched(false);
      setYtError(null);

      if (mySongs.length + 1 >= maxSongs) {
        onClose();
      }
    }
  };

  const handleCopyYouTubeLink = async (e: React.MouseEvent, videoId: string) => {
    e.stopPropagation();
    const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Modern clipboard API
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(ytUrl);
        setCopiedYtVideoId(videoId);
        addToast('YouTube link copied!', 'success');
        setTimeout(() => {
          setCopiedYtVideoId((prev) => (prev === videoId ? null : prev));
        }, 2000);
        return;
      } catch (err) {
        console.warn('navigator.clipboard.writeText failed, attempting fallback:', err);
      }
    }

    // Fallback 1: document.execCommand('copy') with hidden textarea
    try {
      const textArea = document.createElement('textarea');
      textArea.value = ytUrl;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);

      if (successful) {
        setCopiedYtVideoId(videoId);
        addToast('YouTube link copied!', 'success');
        setTimeout(() => {
          setCopiedYtVideoId((prev) => (prev === videoId ? null : prev));
        }, 2000);
        return;
      }
    } catch (fallbackErr) {
      console.warn('execCommand copy fallback failed:', fallbackErr);
    }

    // Fallback 2: prompt modal if clipboard is completely restricted
    try {
      window.prompt('Clipboard access unavailable. Please copy this YouTube URL manually:', ytUrl);
      addToast('YouTube link opened to copy manually.', 'info');
    } catch {
      addToast(`Could not copy link to clipboard: ${ytUrl}`, 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(5, 8, 20, 0.82)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        animation: 'fadeIn 0.2s ease-out'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isUploading) {
          onClose();
        }
      }}
    >
      {/* Hidden preview audio element */}
      <audio
        ref={previewAudioRef}
        onEnded={() => setPreviewTrackId(null)}
        onError={() => setPreviewTrackId(null)}
      />

      <div
        className="card card-glow"
        style={{
          width: '100%',
          maxWidth: '720px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-surface)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1.25rem 1.75rem',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'rgba(255, 255, 255, 0.02)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: 'var(--radius-sm)',
                background: 'linear-gradient(135deg, var(--primary), var(--cyan))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                boxShadow: '0 0 16px var(--primary-glow)'
              }}
            >
              <Music size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, letterSpacing: '-0.02em' }}>
                Add Track to Room
              </h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {mySongs.length}/{maxSongs} song slots filled • Legal catalog search & local uploads
              </span>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onClose}
            disabled={isUploading}
            style={{ borderRadius: '50%', padding: '0.45rem' }}
            title="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'rgba(0, 0, 0, 0.2)'
          }}
        >
          <button
            type="button"
            onClick={() => {
              setActiveTab('agent');
              if (previewAudioRef.current) previewAudioRef.current.pause();
              setPreviewTrackId(null);
            }}
            style={{
              flex: 1,
              minWidth: '150px',
              padding: '0.85rem 1rem',
              background: activeTab === 'agent' ? 'rgba(239, 68, 68, 0.12)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'agent' ? '2px solid #ef4444' : '2px solid transparent',
              color: activeTab === 'agent' ? '#f87171' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.45rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <Download size={16} /> Download Audio
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('youtube');
              if (previewAudioRef.current) previewAudioRef.current.pause();
              setPreviewTrackId(null);
            }}
            style={{
              flex: 1,
              minWidth: '140px',
              padding: '0.85rem 1rem',
              background: activeTab === 'youtube' ? 'rgba(239, 68, 68, 0.08)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'youtube' ? '2px solid #dc2626' : '2px solid transparent',
              color: activeTab === 'youtube' ? '#fca5a5' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.45rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <Search size={16} /> YouTube Stream
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('jamendo');
              if (previewAudioRef.current) previewAudioRef.current.pause();
              setPreviewTrackId(null);
            }}
            style={{
              flex: 1,
              minWidth: '130px',
              padding: '0.85rem 1rem',
              background: activeTab === 'jamendo' ? 'rgba(6, 182, 212, 0.12)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'jamendo' ? '2px solid var(--cyan)' : '2px solid transparent',
              color: activeTab === 'jamendo' ? 'var(--cyan)' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.45rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <Music size={16} /> Jamendo Music
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('upload');
              if (previewAudioRef.current) previewAudioRef.current.pause();
              setPreviewTrackId(null);
            }}
            style={{
              flex: 1,
              minWidth: '140px',
              padding: '0.85rem 1rem',
              background: activeTab === 'upload' ? 'rgba(139, 92, 246, 0.12)' : 'transparent',
              border: 'none',
              borderBottom: activeTab === 'upload' ? '2px solid var(--primary)' : '2px solid transparent',
              color: activeTab === 'upload' ? 'var(--primary)' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.45rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <Upload size={16} /> Upload Audio
          </button>
        </div>

        {/* Tab Body Container */}
        <div style={{ padding: '1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* TAB 0: AGENT YOUTUBE AUDIO DOWNLOAD */}
          {activeTab === 'agent' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1rem 1.25rem'
                }}
              >
                <h4
                  style={{
                    margin: 0,
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    color: '#f87171',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    marginBottom: '0.35rem'
                  }}
                >
                  <Sparkles size={16} /> YT-Ai YouTube Audio Converter
                </h4>
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Paste a YouTube video URL or ID. The YT-Ai engine will automatically convert and extract high-fidelity MP3 audio directly into your room playlist.
                </p>
              </div>

              {/* Form */}
              <form onSubmit={handleAgentDownloadSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div style={{ display: 'flex', gap: '0.65rem' }}>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Paste YouTube link (e.g. https://www.youtube.com/watch?v=... or https://youtu.be/...)"
                    value={agentUrl}
                    onChange={(e) => {
                      setAgentUrl(e.target.value);
                      if (agentError) setAgentError(null);
                    }}
                    disabled={isAgentDownloading}
                    style={{ height: '46px', flex: 1 }}
                    autoFocus
                  />
                  <button
                    type="submit"
                    className="btn"
                    disabled={!agentUrl.trim() || isAgentDownloading || mySongs.length >= maxSongs}
                    style={{
                      minWidth: '130px',
                      height: '46px',
                      background: isAgentDownloading
                        ? 'rgba(239, 68, 68, 0.5)'
                        : 'linear-gradient(135deg, #ef4444, #dc2626)',
                      color: '#fff',
                      border: 'none',
                      fontWeight: 700,
                      boxShadow: '0 0 15px rgba(239, 68, 68, 0.35)'
                    }}
                  >
                    {isAgentDownloading ? (
                      <>
                        <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} />
                        <span>Downloading...</span>
                      </>
                    ) : (
                      <>
                        <Download size={18} />
                        <span>Add Song</span>
                      </>
                    )}
                  </button>
                </div>

                {mySongs.length >= maxSongs && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--amber)' }}>
                    You have reached the maximum song limit ({maxSongs}/{maxSongs} tracks).
                  </div>
                )}
              </form>

              {/* Live Progress Bar and Status Messages */}
              {isAgentDownloading && agentProgress && (
                <div
                  className="card card-glow"
                  style={{
                    background: 'rgba(15, 23, 42, 0.8)',
                    border: '1px solid rgba(239, 68, 68, 0.35)',
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Loader2 size={16} color="#ef4444" style={{ animation: 'spin 1.2s linear infinite' }} />
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: '0.9rem',
                          color: '#f87171',
                          textTransform: 'capitalize'
                        }}
                      >
                        Phase: {agentProgress.status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 800,
                        color: 'var(--cyan)',
                        fontSize: '0.95rem'
                      }}
                    >
                      {agentProgress.percent}%
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div
                    style={{
                      width: '100%',
                      height: '8px',
                      borderRadius: '4px',
                      background: 'rgba(255, 255, 255, 0.1)',
                      overflow: 'hidden'
                    }}
                  >
                    <div
                      style={{
                        width: `${agentProgress.percent}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #ef4444, #f59e0b, var(--cyan))',
                        transition: 'width 0.3s ease',
                        boxShadow: '0 0 10px rgba(239, 68, 68, 0.5)'
                      }}
                    />
                  </div>

                  <div
                    style={{
                      fontSize: '0.825rem',
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem'
                    }}
                  >
                    <span>{agentProgress.message}</span>
                  </div>
                </div>
              )}

              {/* Error Banner */}
              {agentError && (
                <div
                  className="error-banner"
                  style={{
                    margin: 0,
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: '0.5rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <AlertTriangle size={18} color="#ef4444" style={{ flexShrink: 0 }} />
                    <span style={{ fontWeight: 600 }}>{agentError}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Note: If the external conversion service is temporarily rate-limited, you can use the{' '}
                    <strong>YouTube Stream</strong> tab for direct playback or the{' '}
                    <strong>Upload Audio</strong> tab to upload a local audio file.
                  </p>
                </div>
              )}
            </div>
          )}
          {/* TAB 1: YOUTUBE MUSIC SEARCH */}
          {activeTab === 'youtube' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Search Bar Form */}
              <form
                onSubmit={handleYtSearch}
                style={{ display: 'flex', gap: '0.65rem' }}
              >
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search
                    size={18}
                    style={{
                      position: 'absolute',
                      left: '1rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-muted)'
                    }}
                  />
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Search YouTube by song title, artist, or keywords..."
                    value={ytQuery}
                    onChange={(e) => setYtQuery(e.target.value)}
                    style={{
                      paddingLeft: '2.75rem',
                      paddingRight: ytQuery ? '2.5rem' : '1rem',
                      height: '46px'
                    }}
                    autoFocus
                  />
                  {ytQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setYtQuery('');
                        setYtResults([]);
                        setYtHasSearched(false);
                        setYtError(null);
                      }}
                      style={{
                        position: 'absolute',
                        right: '0.75rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: '0.25rem'
                      }}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  className="btn"
                  disabled={!ytQuery.trim() || isYtSearching}
                  style={{
                    minWidth: '110px',
                    height: '46px',
                    background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                    color: '#fff',
                    border: 'none',
                    fontWeight: 700,
                    boxShadow: '0 0 15px rgba(239, 68, 68, 0.35)'
                  }}
                >
                  {isYtSearching ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={18} />}
                  <span>Search</span>
                </button>
              </form>

              {/* YouTube Search Error Banner */}
              {ytError && (
                <div className="error-banner" style={{ margin: 0 }}>
                  <AlertTriangle size={18} />
                  <span>{ytError}</span>
                </div>
              )}

              {/* Searching Loading State */}
              {isYtSearching && (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
                  <Loader2 size={36} color="#ef4444" style={{ animation: 'spin 1.2s linear infinite', margin: '0 auto 1rem' }} />
                  <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>Searching YouTube...</p>
                </div>
              )}

              {/* YouTube Search Results (up to 5 results) */}
              {!isYtSearching && ytResults.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <span>Showing top {ytResults.length} YouTube results</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#f87171' }}>
                      <Sparkles size={13} /> Official YouTube Playback
                    </span>
                  </div>

                  {ytResults.map((item) => {
                    const isAdded = isVideoAdded(item.videoId);
                    const isAddingThis = addingYtVideoId === item.videoId;
                    const isSlotFull = mySongs.length >= maxSongs;
                    const isCopied = copiedYtVideoId === item.videoId;

                    return (
                      <div
                        key={item.videoId}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.85rem 1rem',
                          background: isAdded
                            ? 'rgba(16, 185, 129, 0.08)'
                            : 'rgba(255, 255, 255, 0.03)',
                          border: isAdded
                            ? '1px solid rgba(16, 185, 129, 0.3)'
                            : '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-md)',
                          gap: '0.75rem',
                          flexWrap: 'wrap',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        {/* Video Thumbnail & Details */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', overflow: 'hidden', flex: 1, minWidth: '220px' }}>
                          <div
                            style={{
                              width: '90px',
                              height: '58px',
                              borderRadius: 'var(--radius-sm)',
                              overflow: 'hidden',
                              background: '#000',
                              flexShrink: 0,
                              position: 'relative',
                              border: '1px solid var(--border-subtle)'
                            }}
                          >
                            <img
                              src={item.thumbnail}
                              alt={item.title}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            />
                            <span
                              style={{
                                position: 'absolute',
                                bottom: '3px',
                                right: '3px',
                                background: 'rgba(0, 0, 0, 0.8)',
                                color: '#fff',
                                fontSize: '0.65rem',
                                padding: '1px 4px',
                                borderRadius: '3px',
                                fontWeight: 700
                              }}
                            >
                              {item.duration}
                            </span>
                          </div>

                          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
                            <span
                              style={{
                                fontWeight: 700,
                                fontSize: '0.925rem',
                                color: 'var(--text-main)',
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                                lineHeight: 1.35
                              }}
                              title={item.title}
                            >
                              {item.title}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.3rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              <span style={{ color: '#f87171', fontWeight: 600 }}>YouTube</span>
                              <span>•</span>
                              <span>{item.duration}</span>
                            </div>
                          </div>
                        </div>

                        {/* Action Buttons: Copy Link & Add to Queue */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            flexShrink: 0,
                            flexWrap: 'wrap',
                            justifyContent: 'flex-end'
                          }}
                        >
                          {/* Copy Link Button */}
                          <button
                            type="button"
                            className={`btn btn-sm ${isCopied ? 'btn-emerald' : 'btn-secondary'}`}
                            onClick={(e) => handleCopyYouTubeLink(e, item.videoId)}
                            title={`Copy YouTube link: https://www.youtube.com/watch?v=${item.videoId}`}
                            style={{
                              gap: '0.35rem',
                              whiteSpace: 'nowrap',
                              ...(isCopied
                                ? { background: 'rgba(16, 185, 129, 0.15)', borderColor: 'var(--emerald)', color: 'var(--emerald)' }
                                : {})
                            }}
                          >
                            {isCopied ? (
                              <>
                                <Check size={14} />
                                <span>Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy size={14} />
                                <span>Copy Link</span>
                              </>
                            )}
                          </button>

                          {/* Add to Queue Button */}
                          <button
                            type="button"
                            className={`btn btn-sm ${isAdded ? 'btn-emerald' : 'btn-primary'}`}
                            onClick={() => handleAddYouTubeSong(item)}
                            disabled={isAdded || isAddingThis || isSlotFull}
                            style={{
                              minWidth: '120px',
                              flexShrink: 0,
                              gap: '0.4rem',
                              whiteSpace: 'nowrap',
                              ...(isAdded ? { opacity: 0.9, cursor: 'default' } : {})
                            }}
                          >
                            {isAddingThis ? (
                              <>
                                <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                                <span>Adding...</span>
                              </>
                            ) : isAdded ? (
                              <>
                                <Check size={15} />
                                <span>Added</span>
                              </>
                            ) : (
                              <>
                                <Plus size={15} />
                                <span>Add to Queue</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* No Results Empty State */}
              {!isYtSearching && ytHasSearched && ytResults.length === 0 && !ytError && (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
                  <Music size={40} color="var(--text-muted)" style={{ margin: '0 auto 1rem', opacity: 0.6 }} />
                  <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.35rem' }}>
                    No videos found
                  </h4>
                  <p style={{ fontSize: '0.875rem', maxWidth: '380px', margin: '0 auto', lineHeight: 1.5 }}>
                    No YouTube videos matched "{ytQuery}". Try different keywords, artist names, or song titles.
                  </p>
                </div>
              )}

              {/* Initial State Helper */}
              {!isYtSearching && !ytHasSearched && (
                <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-muted)' }}>
                  <Search size={36} style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
                  <p style={{ fontSize: '0.9rem', margin: 0 }}>
                    Search any track, remix, or live performance from YouTube to play in the room!
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: JAMENDO MUSIC SEARCH */}
          {activeTab === 'jamendo' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Jamendo Configuration Notice if unconfigured */}
              {!isJamendoConfigured && (
                <div
                  style={{
                    padding: '1rem 1.25rem',
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(245, 158, 11, 0.12)',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '0.75rem',
                    fontSize: '0.875rem',
                    color: '#fbbf24'
                  }}
                >
                  <AlertTriangle size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <div style={{ fontWeight: 800, marginBottom: '0.25rem' }}>
                      Jamendo API Not Configured
                    </div>
                    <p style={{ margin: 0, lineHeight: 1.5, color: 'rgba(254, 243, 199, 0.9)' }}>
                      Set <code>JAMENDO_CLIENT_ID</code> in your server environment to search and stream tracks from Jamendo's music catalog. In the meantime, you can add songs using the <strong>Upload From Device</strong> tab!
                    </p>
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => setActiveTab('upload')}
                      style={{ marginTop: '0.6rem' }}
                    >
                      <Upload size={14} /> Switch to Upload From Device
                    </button>
                  </div>
                </div>
              )}

              {/* Search Bar Form */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  executeSearch(searchQuery, 0, false);
                }}
                style={{ display: 'flex', gap: '0.65rem' }}
              >
                <div style={{ position: 'relative', flex: 1 }}>
                  <Search
                    size={18}
                    style={{
                      position: 'absolute',
                      left: '1rem',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: 'var(--text-muted)'
                    }}
                  />
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Search by song name, artist, acoustic, rock, chill..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      paddingLeft: '2.75rem',
                      paddingRight: searchQuery ? '2.5rem' : '1rem',
                      height: '46px'
                    }}
                    autoFocus
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setSearchResults([]);
                        setHasSearched(false);
                      }}
                      style={{
                        position: 'absolute',
                        right: '0.75rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        padding: '0.25rem'
                      }}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  className="btn btn-cyan"
                  disabled={!searchQuery.trim() || isSearching}
                  style={{ minWidth: '110px', height: '46px' }}
                >
                  {isSearching ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Search size={18} />}
                  <span>Search</span>
                </button>
              </form>

              {/* Search Error Banner */}
              {searchError && (
                <div className="error-banner" style={{ margin: 0 }}>
                  <AlertTriangle size={18} />
                  <span>{searchError}</span>
                </div>
              )}

              {/* Search Loading Indicator */}
              {isSearching && (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-secondary)' }}>
                  <Loader2 size={36} color="var(--cyan)" style={{ animation: 'spin 1.2s linear infinite', margin: '0 auto 1rem' }} />
                  <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>Searching Jamendo music catalog...</p>
                </div>
              )}

              {/* Search Results List */}
              {!isSearching && searchResults.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <span>Showing {searchResults.length} of {totalCount} matching tracks</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Sparkles size={13} color="var(--cyan)" /> Jamendo Creative Commons Music
                    </span>
                  </div>

                  {searchResults.map((track) => {
                    const isAdded = isTrackAdded(track.id, track.title);
                    const isPreviewing = previewTrackId === track.id;
                    const isAddingThis = addingTrackId === track.id;

                    return (
                      <div
                        key={track.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.85rem 1rem',
                          background: isPreviewing
                            ? 'rgba(6, 182, 212, 0.12)'
                            : isAdded
                              ? 'rgba(16, 185, 129, 0.08)'
                              : 'rgba(255, 255, 255, 0.03)',
                          border: isPreviewing
                            ? '1px solid var(--border-cyan)'
                            : isAdded
                              ? '1px solid rgba(16, 185, 129, 0.3)'
                              : '1px solid var(--border-subtle)',
                          borderRadius: 'var(--radius-md)',
                          gap: '0.75rem',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        {/* Artwork & Details */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', overflow: 'hidden', flex: 1 }}>
                          {/* Album Artwork or Fallback */}
                          <div
                            style={{
                              width: '46px',
                              height: '46px',
                              borderRadius: 'var(--radius-sm)',
                              overflow: 'hidden',
                              background: 'var(--bg-surface-elevated)',
                              flexShrink: 0,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              border: '1px solid var(--border-subtle)'
                            }}
                          >
                            {track.artwork_url ? (
                              <img
                                src={track.artwork_url}
                                alt={track.title}
                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                loading="lazy"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <Music size={22} color="var(--text-muted)" />
                            )}
                          </div>

                          {/* Title, Artist & Duration */}
                          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
                            <span
                              style={{
                                fontWeight: 700,
                                fontSize: '0.95rem',
                                color: 'var(--text-main)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}
                              title={track.title}
                            >
                              {track.title}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {track.artist}
                              </span>
                              <span>•</span>
                              <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--cyan)' }}>
                                {formatTime(track.duration)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Actions: Preview & Add */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                          {/* Audio Preview Button */}
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => handleTogglePreview(track)}
                            disabled={!track.playable}
                            style={{
                              padding: '0.45rem',
                              borderRadius: '50%',
                              color: isPreviewing ? 'var(--cyan)' : 'var(--text-main)',
                              opacity: track.playable ? 1 : 0.4
                            }}
                            title={
                              !track.playable
                                ? 'Preview unavailable from artist'
                                : isPreviewing
                                  ? 'Pause preview'
                                  : 'Listen to preview'
                            }
                          >
                            {isPreviewing ? <Pause size={17} /> : <Play size={17} />}
                          </button>

                          {/* Add Song Button */}
                          {isAdded ? (
                            <span
                              className="badge badge-ready"
                              style={{ padding: '0.45rem 0.85rem', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                            >
                              <Check size={14} /> Added
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => handleAddJamendoTrack(track)}
                              disabled={isAddingThis || mySongs.length >= maxSongs}
                              style={{ minWidth: '95px' }}
                            >
                              {isAddingThis ? (
                                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                              ) : (
                                <Plus size={15} />
                              )}
                              <span>{isAddingThis ? 'Adding...' : 'Add Song'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Load More Option */}
                  {searchResults.length < totalCount && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => executeSearch(debouncedQuery, offset + 10, true)}
                      disabled={isLoadingMore}
                      style={{ marginTop: '0.5rem', width: '100%' }}
                    >
                      {isLoadingMore ? (
                        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                      ) : (
                        <span>Load More Tracks</span>
                      )}
                    </button>
                  )}
                </div>
              )}

              {/* No Results State */}
              {!isSearching && hasSearched && searchResults.length === 0 && !searchError && (
                <div style={{ textAlign: 'center', padding: '3rem 1.5rem', color: 'var(--text-secondary)' }}>
                  <Music size={40} color="var(--text-muted)" style={{ margin: '0 auto 1rem' }} />
                  <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '0.4rem' }}>
                    No tracks found for "{searchQuery}"
                  </h4>
                  <p style={{ fontSize: '0.875rem', maxWidth: '420px', margin: '0 auto 1.25rem', lineHeight: 1.5 }}>
                    Try searching for broader keywords like <em>rock</em>, <em>electronic</em>, <em>piano</em>, or an artist name. You can also upload a track from your device.
                  </p>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setActiveTab('upload')}
                  >
                    <Upload size={14} /> Upload Audio File Instead
                  </button>
                </div>
              )}

              {/* Initial Empty Search State */}
              {!isSearching && !hasSearched && (
                <div
                  style={{
                    textAlign: 'center',
                    padding: '2.5rem 1.5rem',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px dashed var(--border-subtle)',
                    borderRadius: 'var(--radius-md)'
                  }}
                >
                  <Search size={36} color="var(--cyan)" style={{ margin: '0 auto 0.75rem' }} />
                  <h4 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                    Discover Music on Jamendo
                  </h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: '440px', margin: '0 auto' }}>
                    Enter any song title, artist, or genre keyword above to search thousands of independent tracks cleared for streaming!
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB B: UPLOAD FROM DEVICE */}
          {activeTab === 'upload' && (
            <form onSubmit={handleManualUploadSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              {/* Dropzone Area */}
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                style={{
                  border: dragActive
                    ? '2px dashed var(--cyan)'
                    : selectedFile
                      ? '2px solid var(--border-accent)'
                      : '2px dashed var(--border-accent)',
                  borderRadius: 'var(--radius-lg)',
                  padding: '2.25rem 1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.75rem',
                  background: dragActive
                    ? 'rgba(6, 182, 212, 0.1)'
                    : selectedFile
                      ? 'rgba(139, 92, 246, 0.08)'
                      : 'rgba(139, 92, 246, 0.04)',
                  cursor: isUploading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                  textAlign: 'center',
                  position: 'relative'
                }}
              >
                <input
                  type="file"
                  id="modalFileInput"
                  accept="audio/mp3,audio/wav,audio/ogg,audio/m4a,audio/aac,.mp3,.wav,.ogg,.m4a,.aac"
                  onChange={handleFileChange}
                  disabled={isUploading}
                  style={{ display: 'none' }}
                />

                {!selectedFile ? (
                  <label htmlFor="modalFileInput" style={{ cursor: 'pointer', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
                    <div
                      style={{
                        width: '54px',
                        height: '54px',
                        borderRadius: '50%',
                        background: 'rgba(139, 92, 246, 0.15)',
                        border: '1px solid var(--border-accent)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--primary)',
                        marginBottom: '0.25rem'
                      }}
                    >
                      <Upload size={26} />
                    </div>
                    <span style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text-main)' }}>
                      Drag and drop your audio file here
                    </span>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      or click to browse your computer
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                      Supports MP3, WAV, OGG, M4A, AAC (Up to 20MB)
                    </span>
                  </label>
                ) : (
                  /* Selected File Display Card */
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '0.5rem 0.75rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', overflow: 'hidden' }}>
                      <FileAudio size={36} color="var(--cyan)" style={{ flexShrink: 0 }} />
                      <div style={{ textAlign: 'left', overflow: 'hidden' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {selectedFile.name}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • {selectedFile.type || 'Audio Track'}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        setSelectedFile(null);
                        setUploadError(null);
                      }}
                      disabled={isUploading}
                      style={{ color: 'var(--rose)', padding: '0.4rem' }}
                      title="Remove selected file"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                )}
              </div>

              {/* Upload Validation Error */}
              {uploadError && (
                <div className="error-banner" style={{ margin: 0 }}>
                  <AlertTriangle size={18} />
                  <span>{uploadError}</span>
                </div>
              )}

              {/* Optional Title & Artist Inputs */}
              {selectedFile && (
                <div
                  style={{
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1.1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.85rem'
                  }}
                >
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Sparkles size={15} color="var(--primary)" /> Track Labeling (Optional)
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.85rem' }}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>
                        Song Title
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. Bohemian Rhapsody"
                        value={uploadTitle}
                        onChange={(e) => setUploadTitle(e.target.value)}
                        maxLength={80}
                        disabled={isUploading}
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>
                        Artist Name
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="e.g. Queen"
                        value={uploadArtist}
                        onChange={(e) => setUploadArtist(e.target.value)}
                        maxLength={80}
                        disabled={isUploading}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Upload Progress Bar */}
              {isUploading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    <span>Uploading audio to room...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div
                    style={{
                      width: '100%',
                      height: '6px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      borderRadius: 'var(--radius-full)',
                      overflow: 'hidden'
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${uploadProgress}%`,
                        background: 'linear-gradient(90deg, var(--primary), var(--cyan))',
                        transition: 'width 0.2s ease-in-out'
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Upload Submit Actions */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.25rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onClose}
                  disabled={isUploading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-lg"
                  disabled={!selectedFile || isUploading}
                  style={{ minWidth: '170px' }}
                >
                  {isUploading ? (
                    <>
                      <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Uploading...
                    </>
                  ) : (
                    <>
                      <Upload size={18} /> Upload Track
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Modal Footer Guidelines Notice */}
        <div
          style={{
            padding: '0.85rem 1.75rem',
            background: 'rgba(0, 0, 0, 0.25)',
            borderTop: '1px solid var(--border-subtle)',
            fontSize: '0.75rem',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ShieldAlert size={14} color="var(--amber)" />
            <span>Only add music you have permission to play with friends. Audio streamed in private rooms only.</span>
          </div>
          <span style={{ color: 'var(--text-secondary)' }}>
            No YouTube / 100% Direct Audio
          </span>
        </div>
      </div>
    </div>
  );
};
