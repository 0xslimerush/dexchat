import React, { useState, useEffect, useRef } from 'react';
import AgoraRTC, { IAgoraRTCClient, IAgoraRTCRemoteUser, MicrophoneAudioTrackInitConfig, IMicrophoneAudioTrack } from 'agora-rtc-sdk-ng';

interface VoiceChatProps {
  tier: string;
}

export const VoiceChat: React.FC<VoiceChatProps> = ({ tier }) => {
  const [isJoined, setIsJoined] = useState<boolean>(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState<boolean>(false);
  const [remoteUsers, setRemoteUsers] = useState<IAgoraRTCRemoteUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  // Agora client and local audio track
  const [client, setClient] = useState<IAgoraRTCClient | null>(null);
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const [localAudioTrack, setLocalAudioTrack] = useState<IMicrophoneAudioTrack | null>(null);
  const [isDeafened, setIsDeafened] = useState<boolean>(false);
  // Add: self uid and volume map
  const [selfUid, setSelfUid] = useState<number | null>(null);
  const [volumeMap, setVolumeMap] = useState<Record<string, number>>({});
  
  // Get room ID from URL
  const getRoomId = (): string => {
    const match = window.location.href.match(/dexscreener\.com\/solana\/(\w+)/);
    return match ? match[1] : 'default';
  };
  
  const roomId = getRoomId();
  console.log('[DexChat][VoiceChat] init: roomId=', roomId, 'tier=', tier);

  // Add: backend URL (public HTTPS endpoint)
  const BACKEND_URL = 'https://YOUR_BACKEND_HOST'; // e.g. https://dexchat.yourdomain.com

  // Initialize Agora client
  useEffect(() => {
    const initAgoraClient = async () => {
      try {
        console.log('[DexChat][VoiceChat] creating Agora client...');
        // Create Agora client
        const agoraClient = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        clientRef.current = agoraClient;
        setClient(agoraClient);

        // Connection state change logging
        agoraClient.on('connection-state-change', (curState: any, prevState: any, reason: any) => {
          console.log('[DexChat][Agora] connection-state-change:', { prevState, curState, reason });
        });
        
        // Set up event listeners
        agoraClient.on('user-published', handleUserPublished);
        agoraClient.on('user-unpublished', handleUserUnpublished);
        agoraClient.on('user-joined', handleUserJoined);
        agoraClient.on('user-left', handleUserLeft);
        console.log('[DexChat][VoiceChat] event listeners attached');

        // Get UID (wallet optional for MVP)
        const walletAddress = localStorage.getItem('dexchat-wallet');
        console.log('[DexChat][VoiceChat] walletAddress:', walletAddress);
        let userId: number;

        if (walletAddress && walletAddress.length >= 10) {
          // Derive a numeric uid from the wallet for consistency
          const hexChunk = walletAddress.slice(-8);
          const parsed = parseInt(hexChunk, 16);
          const baseUid = Number.isFinite(parsed) ? parsed : Math.floor(100000000 + Math.random() * 900000000);
          // Add a per-tab salt to avoid UID collisions when testing in multiple tabs
          const tabKey = 'dexchat-tab-id';
          let tabId = sessionStorage.getItem(tabKey);
          if (!tabId) {
            tabId = String(Math.floor(1000 + Math.random() * 9000)); // 4-digit salt per tab
            sessionStorage.setItem(tabKey, tabId);
          }
          const tabSalt = Number(tabId) % 97; // small offset
          userId = baseUid + tabSalt;
          console.log('[DexChat][VoiceChat] uid from wallet with tab salt:', { baseUid, tabSalt, userId });
        } else {
          // Fallback: stable random uid per browser stored in localStorage
          let storedUid = localStorage.getItem('dexchat-uid');
          if (!storedUid) {
            storedUid = String(Math.floor(100000000 + Math.random() * 900000000));
            localStorage.setItem('dexchat-uid', storedUid);
            console.log('[DexChat][VoiceChat] generated new fallback uid:', storedUid);
          } else {
            console.log('[DexChat][VoiceChat] using existing fallback uid:', storedUid);
          }
          // Add a per-tab salt to avoid UID collisions when testing in multiple tabs
          const tabKey = 'dexchat-tab-id';
          let tabId = sessionStorage.getItem(tabKey);
          if (!tabId) {
            tabId = String(Math.floor(1000 + Math.random() * 9000)); // 4-digit salt per tab
            sessionStorage.setItem(tabKey, tabId);
          }
          const tabSalt = Number(tabId) % 97; // small offset
          userId = Number(storedUid) + tabSalt;
          console.log('[DexChat][VoiceChat] fallback uid with tab salt:', { storedUid: Number(storedUid), tabSalt, userId });
        }

        // Get Agora token from backend
        const tokenPayload = { channelName: roomId, uid: userId, role: 'publisher' };
        console.log('[DexChat][VoiceChat] requesting token...', tokenPayload);
        const tokenResponse = await fetch(`${BACKEND_URL}/api/agora-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tokenPayload)
        });
        
        console.log('[DexChat][VoiceChat] token response status:', tokenResponse.status);
        if (!tokenResponse.ok) {
          throw new Error('Failed to get Agora token');
        }
        
        const { token, appId } = await tokenResponse.json();
        console.log('[DexChat][VoiceChat] token received. appId length:', String(appId).length, 'token length:', String(token).length);
        
        // Join the channel
        console.log('[DexChat][VoiceChat] joining channel...', { roomId, userId });
        await agoraClient.join(appId, roomId, token, userId);
        console.log('[DexChat][VoiceChat] joined channel OK:', roomId, 'as uid:', userId);
        setSelfUid(userId);
    
        // Enable volume indicators for speaking detection
        const c: any = agoraClient as any;
        c.enableAudioVolumeIndicator?.();
        const onVolumeIndicator = (volumes: Array<{ uid: string | number; level: number }>) => {
          setVolumeMap(prev => {
            const next = { ...prev };
            volumes.forEach(v => {
              next[String(v.uid)] = v.level;
            });
            // Include self level if publishing local track
            if (selfUid != null && localAudioTrack) {
              try {
                // getVolumeLevel() returns 0..1
                next[String(selfUid)] = localAudioTrack.getVolumeLevel ? localAudioTrack.getVolumeLevel() : next[String(selfUid)] || 0;
              } catch {}
            }
            return next;
          });
        };
        c.on?.('volume-indicator', onVolumeIndicator);
    
        setIsJoined(true);
      } catch (error) {
        console.error('Error initializing Agora client:', error);
        if (error instanceof TypeError) {
          setError('Cannot reach backend (http://localhost:3000). Please start the backend server and ensure host permissions allow localhost.');
        } else {
          setError('Failed to initialize voice chat. Please try again.');
        }
      }
    };
    
    initAgoraClient();
    
    return () => {
      // Clean up when component unmounts
      console.log('[DexChat][VoiceChat] unmount -> leaveChannel()');
      leaveChannel();
      try {
        const c: any = clientRef.current as any;
        c?.off?.('volume-indicator');
      } catch {}
    };
  }, [roomId]);

  // Handle remote user published
  const handleUserPublished = async (user: IAgoraRTCRemoteUser, mediaType: 'audio' | 'video') => {
    console.log('[DexChat][VoiceChat] user-published:', { uid: user.uid, mediaType });
    if (mediaType === 'audio') {
      // Subscribe to remote user's audio track using ref to avoid stale client
      await clientRef.current?.subscribe(user, mediaType);
      console.log('[DexChat][VoiceChat] subscribed to remote audio:', user.uid);
      try {
        user.audioTrack?.play();
        console.log('[DexChat][VoiceChat] remote audio playing:', user.uid);
      } catch (e) {
        console.warn('Remote audio play() was blocked, deferring until next user gesture:', e);
        const resume = () => {
          try {
            user.audioTrack?.play();
            console.log('[DexChat][VoiceChat] remote audio playing after gesture:', user.uid);
          } catch (err) {
            console.error('Failed to play remote audio after gesture:', err);
          } finally {
            window.removeEventListener('click', resume);
          }
        };
        window.addEventListener('click', resume, { once: true });
      }
      
      setRemoteUsers(prevUsers => {
        const exists = prevUsers.find(u => u.uid === user.uid);
        const next = exists ? prevUsers : [...prevUsers, user];
        console.log('[DexChat][VoiceChat] remote users count after publish:', next.length);
        return next;
      });
    }
  };

  // Handle remote user unpublished
  const handleUserUnpublished = (user: IAgoraRTCRemoteUser) => {
    console.log('[DexChat][VoiceChat] user-unpublished:', user.uid);
  };

  // Handle remote user joined
  const handleUserJoined = (user: IAgoraRTCRemoteUser) => {
    console.log('[DexChat][VoiceChat] user-joined:', user.uid);
    setRemoteUsers(prevUsers => {
      const exists = prevUsers.find(u => u.uid === user.uid);
      const next = exists ? prevUsers : [...prevUsers, user];
      console.log('[DexChat][VoiceChat] remote users count after join:', next.length);
      return next;
    });
  };

  // Handle remote user left
  const handleUserLeft = (user: IAgoraRTCRemoteUser) => {
    console.log('[DexChat][VoiceChat] user-left:', user.uid);
    setRemoteUsers(prevUsers => {
      const next = prevUsers.filter(u => u.uid !== user.uid);
      console.log('[DexChat][VoiceChat] remote users count after leave:', next.length);
      return next;
    });
  };

  // Toggle microphone
  const toggleMicrophone = async () => {
    try {
      console.log('[DexChat][VoiceChat] toggleMicrophone -> isAudioEnabled:', isAudioEnabled);
      if (isAudioEnabled) {
        await localAudioTrack?.stop();
        await localAudioTrack?.close();
        console.log('[DexChat][VoiceChat] local mic stopped/closed');
        setLocalAudioTrack(null);
        setIsAudioEnabled(false);
      } else {
        const audioConfig: MicrophoneAudioTrackInitConfig = { AEC: true, ANS: true };
        const microphoneTrack = await AgoraRTC.createMicrophoneAudioTrack(audioConfig);
        console.log('[DexChat][VoiceChat] mic track created');
        await clientRef.current?.publish(microphoneTrack);
        console.log('[DexChat][VoiceChat] mic track published');
        setLocalAudioTrack(microphoneTrack);
        setIsAudioEnabled(true);
      }
    } catch (error) {
      console.error('Error toggling microphone:', error);
      setError('Failed to toggle microphone. Please check your permissions.');
    }
  };

  const toggleDeafen = async () => {
    try {
      const c = clientRef.current;
      if (!c) {
        console.warn('[DexChat][VoiceChat] toggleDeafen: no client');
        return;
      }
      console.log('[DexChat][VoiceChat] toggleDeafen -> currently deafened:', isDeafened, 'remoteUsers:', c.remoteUsers.length);
      if (!isDeafened) {
        c.remoteUsers.forEach(u => {
          try {
            u.audioTrack?.setVolume(0);
            console.log('[DexChat][VoiceChat] muted remote uid via volume:', u.uid);
          } catch (e) {
            u.audioTrack?.stop();
            console.log('[DexChat][VoiceChat] fallback stop() for remote uid:', u.uid);
          }
        });
        setIsDeafened(true);
      } else {
        c.remoteUsers.forEach(u => {
          try {
            u.audioTrack?.setVolume(100);
            u.audioTrack?.play();
            console.log('[DexChat][VoiceChat] unmuted remote uid via volume+play:', u.uid);
          } catch (e) {
            console.error('Error re-enabling remote audio:', e);
          }
        });
        setIsDeafened(false);
      }
    } catch (e) {
      console.error('Error toggling deafen:', e);
      setError('Failed to toggle listening.');
    }
  };

  const leaveChannel = async () => {
    try {
      console.log('[DexChat][VoiceChat] leaving channel...');
      if (localAudioTrack) {
        localAudioTrack.stop();
        localAudioTrack.close();
        console.log('[DexChat][VoiceChat] local mic cleaned up');
      }
      await clientRef.current?.leave();
      console.log('[DexChat][VoiceChat] left Agora channel');
      setIsJoined(false);
      setIsAudioEnabled(false);
      setIsDeafened(false);
      setRemoteUsers([]);
      setLocalAudioTrack(null);
      console.log('[DexChat][VoiceChat] state reset complete');
    } catch (error) {
      console.error('Error leaving channel:', error);
    }
  };

  const joinVoice = async () => {
    try {
      if (!isJoined) {
        // The component auto-joins on mount; if not, inform user
        console.warn('Voice channel not ready yet. Try again after the UI finishes loading.');
      }
      if (!isAudioEnabled) {
        await toggleMicrophone();
      }
    } catch (e) {
      console.error('Error joining voice:', e);
      setError('Failed to join voice.');
    }
  };

  useEffect(() => {
    // Expose control/status API for popup
    // @ts-ignore
    window.dexchatVoice = {
      getStatus: () => ({
        connected: isJoined,
        muted: !isAudioEnabled,
        deafened: isDeafened,
        userCount: (remoteUsers?.length || 0) + (isJoined ? 1 : 0),
        tier,
      }),
      join: joinVoice,
      toggleMute: toggleMicrophone,
      toggleDeafen: toggleDeafen,
      leave: leaveChannel,
    };
    return () => {
      // @ts-ignore
      if (window.dexchatVoice) {
        // @ts-ignore
        delete window.dexchatVoice;
      }
    };
  }, [isJoined, isAudioEnabled, isDeafened, remoteUsers, tier]);
  
  return (
    <div className="dexchat-voice">
      <h3 style={{ margin: '0 0 8px 0', fontSize: 14, fontWeight: 600 }}>Voice Chat</h3>
  
      {error && <p className="dexchat-error">{error}</p>}
  
      {/* Participants + indicators */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
          <StatusDot active={isJoined} />
          <span style={{ fontSize: 12, opacity: 0.85 }}>
            {isJoined ? 'Connected' : 'Connecting...'} • Users: {(remoteUsers?.length || 0) + (isJoined ? 1 : 0)}
          </span>
        </div>
        <div style={{ maxHeight: 120, overflowY: 'auto', padding: '6px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: 6 }}>
          <Participant
            name="You"
            uid={selfUid ?? '—'}
            level={selfUid != null ? (volumeMap[String(selfUid)] || 0) : 0}
            highlightColor="#4ade80"
          />
          {remoteUsers.map(u => (
            <Participant
              key={String(u.uid)}
              name={`User ${u.uid}`}
              uid={u.uid}
              level={volumeMap[String(u.uid)] || 0}
              highlightColor="#60a5fa"
            />
          ))}
        </div>
      </div>
  
      <div className="dexchat-voice-controls" style={{ display: 'flex', gap: 8 }}>
        <button
          className={`dexchat-mic-button ${isAudioEnabled ? 'active' : ''}`}
          onClick={toggleMicrophone}
          disabled={!isJoined}
          style={buttonStyle(isAudioEnabled)}
        >
          {isAudioEnabled ? 'Mute' : 'Unmute'}
        </button>
  
        <button
          onClick={toggleDeafen}
          disabled={!isJoined}
          style={buttonStyle(isDeafened)}
        >
          {isDeafened ? 'Undeafen' : 'Deafen'}
        </button>
  
        <button
          onClick={leaveChannel}
          disabled={!isJoined}
          style={dangerButtonStyle()}
        >
          Leave
        </button>
      </div>
      
      <div className="dexchat-participants">
        <h4>Participants ({remoteUsers.length + 1})</h4>
        <ul>
          <li className="dexchat-local-user">
            You {isAudioEnabled ? '(Speaking)' : '(Muted)'}
          </li>
          {remoteUsers.map(user => (
            <li key={user.uid} className="dexchat-remote-user">
              User {user.uid.toString().slice(0, 6)} {user.hasAudio ? '(Speaking)' : '(Muted)'}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

// Small inline UI helpers inside this file (below component or above return)
/* eslint-disable react/display-name */
const StatusDot = ({ active }: { active: boolean }) => (
  <span
    style={{
      width: 10,
      height: 10,
      borderRadius: '50%',
      display: 'inline-block',
      background: active ? '#22c55e' : '#f59e0b',
      boxShadow: active ? '0 0 8px rgba(34,197,94,0.7)' : 'none',
    }}
  />
);

const Participant = ({ name, uid, level, highlightColor }: { name: string; uid: string | number; level: number; highlightColor: string }) => {
  const speaking = (level || 0) > 0.06;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          display: 'inline-block',
          background: speaking ? highlightColor : 'rgba(255,255,255,0.25)',
          boxShadow: speaking ? `0 0 10px ${highlightColor}` : 'none',
          transition: 'all 120ms ease',
        }}
      />
      <span style={{ fontSize: 12, opacity: 0.9 }}>{name}</span>
      <span style={{ fontSize: 11, opacity: 0.55, marginLeft: 'auto' }}>uid: {uid}</span>
    </div>
  );
};

const buttonStyle = (active: boolean): React.CSSProperties => ({
  background: active ? 'rgba(34,197,94,0.15)' : 'transparent',
  border: `1px solid ${active ? 'rgba(34,197,94,0.7)' : 'rgba(255,255,255,0.25)'}`,
  color: '#fff',
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: 12,
  cursor: 'pointer',
});

const dangerButtonStyle = (): React.CSSProperties => ({
  background: 'rgba(239,68,68,0.12)',
  border: '1px solid rgba(239,68,68,0.55)',
  color: '#fff',
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: 12,
  cursor: 'pointer',
});