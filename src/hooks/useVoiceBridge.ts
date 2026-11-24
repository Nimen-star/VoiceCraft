import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildInGameHudPayload,
  computeSpatialAudio,
  InGameHudPayload,
  normalizeGamertag,
  normalizeRoomCode,
  PlayerVoiceState,
  RoomPublicState,
  VoiceScope,
} from '../shared/voiceProtocol';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface JoinOptions {
  roomCode: string;
  gamertag: string;
  scope: VoiceScope;
  privateChannel: string;
  pin?: string;
  range: number;
}

interface PeerAudioPipeline {
  pc: RTCPeerConnection;
  gainNode?: GainNode;
  pannerNode?: StereoPannerNode;
  audioEl?: HTMLAudioElement;
}

export function useVoiceBridge() {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomPublicState | null>(null);
  const [micEnabled, setMicEnabled] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micLoopRef = useRef<number | null>(null);
  const peersRef = useRef<Map<string, PeerAudioPipeline>>(new Map());
  const selfSpeakingRef = useRef(false);

  const selfPlayer: PlayerVoiceState | null = useMemo(() => {
    if (!room || !playerId) return null;
    return room.players.find((p) => p.id === playerId) ?? null;
  }, [room, playerId]);

  const hudPayload: InGameHudPayload | null = useMemo(() => {
    if (!room) return null;
    return buildInGameHudPayload(room, selfPlayer?.gamertag);
  }, [room, selfPlayer?.gamertag]);

  const cleanupPeers = useCallback(() => {
    for (const pipeline of peersRef.current.values()) {
      pipeline.pc.close();
      if (pipeline.audioEl) pipeline.audioEl.srcObject = null;
    }
    peersRef.current.clear();
  }, []);

  const stopMic = useCallback(() => {
    if (micLoopRef.current !== null) {
      cancelAnimationFrame(micLoopRef.current);
      micLoopRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setMicEnabled(false);
    setMicLevel(0);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'state', speaking: false }));
    }
  }, []);

  const ensureAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new Ctx();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume().catch(() => {});
    }
    return audioCtxRef.current;
  }, []);

  const createPeerConnection = useCallback(
    (peerId: string, initiator: boolean) => {
      if (peersRef.current.has(peerId)) {
        return peersRef.current.get(peerId)!;
      }

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });

      const pipeline: PeerAudioPipeline = { pc };
      peersRef.current.set(peerId, pipeline);

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      pc.onicecandidate = (ev) => {
        if (ev.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              type: 'rtc-signal',
              targetId: peerId,
              signal: { kind: 'candidate', candidate: ev.candidate },
            })
          );
        }
      };

      pc.ontrack = (ev) => {
        const remoteStream = ev.streams[0];
        if (!remoteStream) return;
        try {
          const ctx = ensureAudioContext();
          const source = ctx.createMediaStreamSource(remoteStream);
          const gainNode = ctx.createGain();
          const pannerNode = ctx.createStereoPanner();
          source.connect(pannerNode);
          pannerNode.connect(gainNode);
          gainNode.connect(ctx.destination);
          pipeline.gainNode = gainNode;
          pipeline.pannerNode = pannerNode;
        } catch {
          const audioEl = new Audio();
          audioEl.srcObject = remoteStream;
          audioEl.autoplay = true;
          pipeline.audioEl = audioEl;
        }
      };

      if (initiator) {
        pc.createOffer()
          .then((offer) => pc.setLocalDescription(offer))
          .then(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN && pc.localDescription) {
              wsRef.current.send(
                JSON.stringify({
                  type: 'rtc-signal',
                  targetId: peerId,
                  signal: { kind: 'sdp', sdp: pc.localDescription },
                })
              );
            }
          })
          .catch(() => {});
      }

      return pipeline;
    },
    [ensureAudioContext]
  );

  // Sync WebRTC audio tracks & spatial gains strictly from authoritative in-game Minecraft state
  useEffect(() => {
    if (!room || !playerId || !selfPlayer) return;

    if (localStreamRef.current) {
      const canTransmit = !selfPlayer.muted && !selfPlayer.speakingDisabled;
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = canTransmit;
      });
    }

    const currentPeerIds = new Set(
      room.players.filter((p) => p.id !== playerId && p.packetSource === 'browser').map((p) => p.id)
    );

    for (const [id, pipeline] of peersRef.current.entries()) {
      if (!currentPeerIds.has(id)) {
        pipeline.pc.close();
        peersRef.current.delete(id);
      }
    }

    for (const peer of room.players) {
      if (peer.id === playerId) continue;
      if (peer.packetSource === 'browser' && !peersRef.current.has(peer.id)) {
        const initiator = playerId < peer.id;
        createPeerConnection(peer.id, initiator);
      }
      const pipeline = peersRef.current.get(peer.id);
      if (pipeline?.gainNode && pipeline?.pannerNode) {
        const spatial = computeSpatialAudio(selfPlayer, peer, room.maxRange);
        pipeline.gainNode.gain.value = spatial.audible ? spatial.gain : 0;
        pipeline.pannerNode.pan.value = spatial.pan;
      }
    }
  }, [room, playerId, selfPlayer, createPeerConnection]);

  const enableMicrophone = useCallback(async () => {
    setMicError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError('Microphone API is unavailable in this browser context.');
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      localStreamRef.current = stream;
      const ctx = ensureAudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      setMicEnabled(true);

      for (const pipeline of peersRef.current.values()) {
        stream.getTracks().forEach((track) => {
          pipeline.pc.addTrack(track, stream);
        });
      }

      const buffer = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i++) {
          const v = (buffer[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buffer.length);
        const level = Math.min(100, Math.round(rms * 420));
        setMicLevel(level);

        const isSpeaking = level > 12;
        if (isSpeaking !== selfSpeakingRef.current) {
          selfSpeakingRef.current = isSpeaking;
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'state', speaking: isSpeaking }));
          }
        }
        micLoopRef.current = requestAnimationFrame(tick);
      };
      micLoopRef.current = requestAnimationFrame(tick);
      return true;
    } catch {
      setMicError('Microphone access denied or unavailable in this browser.');
      return false;
    }
  }, [ensureAudioContext]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    cleanupPeers();
    stopMic();
    setStatus('disconnected');
    setPlayerId(null);
    setRoom(null);
  }, [cleanupPeers, stopMic]);

  const joinRoom = useCallback(
    (opts: JoinOptions) => {
      const code = normalizeRoomCode(opts.roomCode);
      const tag = normalizeGamertag(opts.gamertag);
      if (!code || !tag) {
        setErrorMessage('Enter both a valid Gamertag and Room Code.');
        return;
      }

      if (wsRef.current) {
        wsRef.current.close();
      }
      cleanupPeers();
      setErrorMessage(null);
      setStatus('connecting');

      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${wsProtocol}//${window.location.host}/ws/client`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: 'join',
            roomCode: code,
            gamertag: tag,
            scope: opts.scope,
            privateChannel: opts.privateChannel || 'squad',
            pin: opts.pin || '',
            range: opts.range,
          })
        );
      };

      ws.onmessage = async (ev) => {
        try {
          const msg = JSON.parse(ev.data as string);
          if (msg.type === 'error') {
            setErrorMessage(msg.error || 'Connection rejected');
            setStatus('error');
            return;
          }
          if (msg.type === 'joined') {
            setPlayerId(msg.playerId);
            setRoom(msg.room);
            setStatus('connected');
            setErrorMessage(null);
          } else if (msg.type === 'room-state') {
            setRoom(msg.room);
          } else if (msg.type === 'rtc-signal' && msg.fromId) {
            const pipeline = createPeerConnection(msg.fromId, false);
            const sig = msg.signal;
            if (sig.kind === 'sdp' && sig.sdp) {
              await pipeline.pc.setRemoteDescription(new RTCSessionDescription(sig.sdp));
              if (sig.sdp.type === 'offer') {
                const answer = await pipeline.pc.createAnswer();
                await pipeline.pc.setLocalDescription(answer);
                ws.send(
                  JSON.stringify({
                    type: 'rtc-signal',
                    targetId: msg.fromId,
                    signal: { kind: 'sdp', sdp: pipeline.pc.localDescription },
                  })
                );
              }
            } else if (sig.kind === 'candidate' && sig.candidate) {
              await pipeline.pc.addIceCandidate(new RTCIceCandidate(sig.candidate));
            }
          }
        } catch {
          // Ignore malformed WS message
        }
      };

      ws.onerror = () => {
        setStatus('error');
        setErrorMessage('WebSocket connection error.');
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          setStatus((prev) => (prev === 'error' ? 'error' : 'disconnected'));
        }
      };
    },
    [cleanupPeers, createPeerConnection]
  );

  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    status,
    errorMessage,
    room,
    selfPlayer,
    hudPayload,
    micEnabled,
    micLevel,
    micError,
    joinRoom,
    disconnect,
    enableMicrophone,
    stopMic,
  };
}
