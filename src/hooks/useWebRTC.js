import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const API_BASE_URL = import.meta.env.VITE_BACKEND_URL
console.log("DEBUG", API_BASE_URL)

export const useWebRTC = (roomId, role, onRemoteStream) => {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [viewersCount, setViewersCount] = useState(0);
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef({});
  const iceServersRef = useRef([]);

  // Initialize socket connection
  useEffect(() => {
    if (!roomId) return;

    const newSocket = io(API_BASE_URL, {
      withCredentials: true,
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
      stopStreaming();
    };
  }, [roomId]);

  // Fetch ICE servers with CORS handling
  useEffect(() => {
    const fetchIceServers = async () => {
      try {
        console.log('Fetching ICE servers from:', `${API_BASE_URL}/api/ice`);
        const response = await fetch(`${API_BASE_URL}/api/ice`, {
          method: 'GET',
          // credentials: 'include',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        });

        console.log('ICE server response status:', response.status);

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const contentType = response.headers.get('content-type');
        console.log('Content-Type:', contentType);

        if (!contentType || !contentType.includes('application/json')) {
          // If it's not JSON, read as text to see what we're getting
          const text = await response.text();
          console.warn('Received non-JSON response:', text.substring(0, 200));
          throw new Error(`Expected JSON but got: ${contentType}`);
        }

        const data = await response.json();
        iceServersRef.current = data.iceServers;
        console.log('✅ ICE servers fetched successfully:', data.iceServers);
      } catch (error) {
        console.warn('❌ Could not fetch ICE servers, using fallback:', error.message);
        // Use fallback servers
        iceServersRef.current = [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:global.stun.twilio.com:3478" },
          { urls: "stun:stun1.l.google.com:19302" },
          { urls: "stun:stun2.l.google.com:19302" },
          { urls: "stun:stun3.l.google.com:19302" },
          { urls: "stun:stun4.l.google.com:19302" },
        ];
      }
    };

    fetchIceServers();
  }, []);

  // Socket event handlers
  useEffect(() => {
    if (!socket || !roomId) return;

    console.log(`Setting up socket events for ${role} in room ${roomId}`);

    const handleConnect = () => {
      console.log('✅ Connected to signaling server');
      setIsConnected(true);
      // Join room immediately after connection
      socket.emit('join-room', { roomId, role });
    };

    const handleDisconnect = () => {
      console.log('❌ Disconnected from signaling server');
      setIsConnected(false);
    };

    const handleRoomJoined = (data) => {
      console.log('🎉 Room joined:', data);
    };

    const handleRoomError = (data) => {
      console.error('🚨 Room error:', data.message);
      if (onRemoteStream) onRemoteStream(null);
    };

    const handleViewerJoined = async ({ viewerId }) => {
      console.log('👀 Viewer joined:', viewerId);
      setViewersCount(prev => prev + 1);
      if (role === 'publisher' && localStreamRef.current) {
        await createPublisherConnection(viewerId);
      }
    };

    const handleViewerLeft = ({ viewerId }) => {
      console.log('👋 Viewer left:', viewerId);
      setViewersCount(prev => prev - 1);
      if (peerConnectionsRef.current[viewerId]) {
        peerConnectionsRef.current[viewerId].close();
        delete peerConnectionsRef.current[viewerId];
      }
    };

    const handleWebRtcOffer = async ({ fromId, sdp }) => {
      console.log('💻 Viewer: Received offer from publisher:', fromId);
      console.log('💻 Viewer: Offer SDP type:', sdp.type);
      if (role === 'viewer') {
        await createViewerConnection(fromId, sdp);
      }
    };

    const handleWebRtcAnswer = async ({ fromId, sdp }) => {
      console.log('📨 Received answer from:', fromId);
      const peerConnection = peerConnectionsRef.current[fromId];
      if (peerConnection) {
        await peerConnection.setRemoteDescription(sdp);
      }
    };

    const handleWebRtcIceCandidate = async ({ fromId, candidate }) => {
      console.log('🧊 Received ICE candidate from:', fromId);
      const peerConnection = peerConnectionsRef.current[fromId];
      if (peerConnection) {
        await peerConnection.addIceCandidate(candidate);
      }
    };

    const handlePublisherLeft = () => {
      console.log('📴 Publisher left the room');
      if (onRemoteStream) onRemoteStream(null);
      Object.values(peerConnectionsRef.current).forEach(pc => pc.close());
      peerConnectionsRef.current = {};
    };

    // Setup event listeners
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('room-joined', handleRoomJoined);
    socket.on('room-error', handleRoomError);

    if (role === 'publisher') {
      socket.on('viewer-joined', handleViewerJoined);
      socket.on('viewer-left', handleViewerLeft);
      socket.on('webrtc-answer', handleWebRtcAnswer);
      socket.on('webrtc-ice-candidate', handleWebRtcIceCandidate);
    } else {
      socket.on('webrtc-offer', handleWebRtcOffer);
      socket.on('webrtc-ice-candidate', handleWebRtcIceCandidate);
      socket.on('publisher-left', handlePublisherLeft);
    }

    // Join room if already connected
    if (socket.connected) {
      socket.emit('join-room', { roomId, role });
    }

    return () => {
      // Cleanup event listeners
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('room-joined', handleRoomJoined);
      socket.off('room-error', handleRoomError);
      socket.off('viewer-joined', handleViewerJoined);
      socket.off('viewer-left', handleViewerLeft);
      socket.off('webrtc-offer', handleWebRtcOffer);
      socket.off('webrtc-answer', handleWebRtcAnswer);
      socket.off('webrtc-ice-candidate', handleWebRtcIceCandidate);
      socket.off('publisher-left', handlePublisherLeft);
    };
  }, [socket, roomId, role, onRemoteStream]);

  const startStreaming = useCallback(async () => {
    try {
      console.log('🎥 Requesting media permissions...');

      // Check if media devices are available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Media devices API not supported in this browser');
      }

      // Get available devices for better error reporting
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter(device => device.kind === 'videoinput');
      const mics = devices.filter(device => device.kind === 'audioinput');

      console.log('📷 Available cameras:', cameras.length);
      console.log('🎤 Available microphones:', mics.length);

      // Adaptive constraints for different devices
      const constraints = {
        video: {
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 },
          facingMode: 'user', // Prefer front camera
          // Mobile-specific optimizations
          aspectRatio: { ideal: 16 / 9 },
          resizeMode: 'crop-and-scale'
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: { ideal: 2 },
          // Mobile audio optimizations
          sampleRate: { ideal: 48000 },
          sampleSize: { ideal: 16 }
        }
      };

      // Try to get media with constraints
      console.log('🔧 Using constraints:', constraints);
      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      // Log stream details
      const videoTracks = stream.getVideoTracks();
      const audioTracks = stream.getAudioTracks();

      console.log('✅ Media access granted');
      console.log('📹 Video tracks:', videoTracks.length);
      console.log('🎵 Audio tracks:', audioTracks.length);

      if (videoTracks.length > 0) {
        const videoSettings = videoTracks[0].getSettings();
        console.log('📊 Video settings:', {
          width: videoSettings.width,
          height: videoSettings.height,
          frameRate: videoSettings.frameRate,
          deviceId: videoSettings.deviceId
        });
      }

      if (audioTracks.length > 0) {
        const audioSettings = audioTracks[0].getSettings();
        console.log('📊 Audio settings:', {
          sampleRate: audioSettings.sampleRate,
          channelCount: audioSettings.channelCount,
          deviceId: audioSettings.deviceId
        });
      }

      localStreamRef.current = stream;
      setIsStreaming(true);

      // Set up track ended handling
      stream.getTracks().forEach(track => {
        track.onended = () => {
          console.warn(`⚠️ Track ended: ${track.kind}`);
          if (track.kind === 'video') {
            alert('Camera access was revoked. Please check permissions.');
            stopStreaming();
          }
        };
      });

      return true;

    } catch (error) {
      console.error('❌ Error accessing media devices:', error);

      // Specific error handling
      let errorMessage = 'Could not access camera/microphone. ';

      switch (error.name) {
        case 'NotAllowedError':
          errorMessage += 'Permission denied. Please allow camera and microphone access.';
          break;
        case 'NotFoundError':
        case 'OverconstrainedError':
          errorMessage += 'No suitable camera found. Please check your device.';
          break;
        case 'NotReadableError':
          errorMessage += 'Camera/microphone is already in use by another application.';
          break;
        case 'SecurityError':
          errorMessage += 'Camera/microphone access is blocked by browser security settings.';
          break;
        default:
          errorMessage += `Please check permissions and try again. (${error.message})`;
      }

      alert(errorMessage);
      return false;
    }
  }, []);

  const stopStreaming = useCallback(() => {
    console.log('🛑 Stopping stream and cleaning up...');

    // Stop all media tracks
    if (localStreamRef.current) {
      const tracks = localStreamRef.current.getTracks();
      console.log(`⏹️ Stopping ${tracks.length} tracks`);

      tracks.forEach(track => {
        console.log(`⏹️ Stopping ${track.kind} track`);
        track.stop();
        track.onended = null; // Clean up event handlers
      });

      localStreamRef.current = null;
    }

    // Close all peer connections with cleanup
    const peerIds = Object.keys(peerConnectionsRef.current);
    console.log(`🔌 Closing ${peerIds.length} peer connections`);

    peerIds.forEach(viewerId => {
      const pc = peerConnectionsRef.current[viewerId];
      if (pc) {
        console.log(`🔌 Closing connection with viewer: ${viewerId}`);

        // Remove event listeners to prevent memory leaks
        pc.onicecandidate = null;
        pc.onconnectionstatechange = null;
        pc.oniceconnectionstatechange = null;
        pc.onnegotiationneeded = null;
        pc.ontrack = null;

        // Close connection
        pc.close();
      }
    });

    peerConnectionsRef.current = {};

    // Reset states
    setIsStreaming(false);
    setViewersCount(0);

    // Notify viewers that publisher left (if socket is available)
    if (socket && roomId) {
      console.log('📢 Notifying viewers that stream ended');
      socket.emit('publisher-left', { roomId });
    }

    console.log('✅ Stream stopped and cleaned up successfully');
  }, [roomId, socket]);

  const createPublisherConnection = async (viewerId) => {
    try {
      console.log('🎥 Publisher: Creating connection for viewer:', viewerId);

      if (!localStreamRef.current) {
        console.error('❌ Publisher: No local stream available');
        return;
      }

      // Log stream details for debugging
      const tracks = localStreamRef.current.getTracks();
      console.log('🎥 Publisher: Stream tracks:', tracks.map(t => ({
        kind: t.kind,
        readyState: t.readyState,
        enabled: t.enabled,
        muted: t.muted
      })));

      const peerConnection = new RTCPeerConnection({
        iceServers: iceServersRef.current
      });
      peerConnectionsRef.current[viewerId] = peerConnection;

      // Add local stream to connection with detailed logging
      tracks.forEach(track => {
        console.log('🎥 Publisher: Adding track:', track.kind);
        peerConnection.addTrack(track, localStreamRef.current);
      });

      // Enhanced ICE candidate handling with logging
      peerConnection.onicecandidate = (event) => {
        console.log('🧊 Publisher: ICE candidate event:', event.candidate ? 'has candidate' : 'end of candidates');

        if (event.candidate && socket) {
          console.log('📤 Publisher: Sending ICE candidate to viewer:', viewerId);
          socket.emit('webrtc-ice-candidate', {
            targetId: viewerId,
            candidate: event.candidate
          });
        } else if (!event.candidate) {
          console.log('✅ Publisher: ICE gathering complete for viewer:', viewerId);
        }
      };

      // Detailed connection state monitoring
      peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        console.log(`🔗 Publisher: Connection state with ${viewerId}:`, state);

        if (state === 'connected') {
          console.log('✅ Publisher: Successfully connected to viewer:', viewerId);
        } else if (state === 'failed' || state === 'disconnected') {
          console.warn('⚠️ Publisher: Connection issue with viewer:', viewerId, state);
        }
      };

      // ICE connection state monitoring
      peerConnection.oniceconnectionstatechange = () => {
        const iceState = peerConnection.iceConnectionState;
        console.log('🧊 Publisher: ICE connection state:', iceState);

        if (iceState === 'failed') {
          console.error('❌ Publisher: ICE connection failed with viewer:', viewerId);
          // Consider renegotiation or cleanup
        } else if (iceState === 'connected') {
          console.log('✅ Publisher: ICE connected successfully with viewer:', viewerId);
        }
      };

      // Negotiation needed event (for renegotiation)
      peerConnection.onnegotiationneeded = () => {
        console.log('🔄 Publisher: Negotiation needed for viewer:', viewerId);
      };

      // Create and send offer with error handling
      console.log('📝 Publisher: Creating offer for viewer:', viewerId);
      const offer = await peerConnection.createOffer();

      console.log('📋 Publisher: Setting local description with offer');
      await peerConnection.setLocalDescription(offer);

      if (socket) {
        console.log('📤 Publisher: Sending offer to viewer:', viewerId);
        socket.emit('webrtc-offer', {
          targetId: viewerId,
          sdp: offer
        });
        console.log('✅ Publisher: Offer sent successfully to viewer:', viewerId);
      } else {
        console.error('❌ Publisher: Socket not available to send offer');
      }

    } catch (error) {
      console.error('❌ Publisher: Error creating connection for viewer:', viewerId, error);

      // Specific error handling
      if (error.name === 'InvalidStateError') {
        console.error('❌ Publisher: PeerConnection in invalid state');
      } else if (error.name === 'NotReadableError') {
        console.error('❌ Publisher: Could not access media devices');
      } else {
        console.error('❌ Publisher: Unexpected error:', error.message);
      }

      // Cleanup on error
      if (peerConnectionsRef.current[viewerId]) {
        peerConnectionsRef.current[viewerId].close();
        delete peerConnectionsRef.current[viewerId];
      }
    }
  };
  // In the createViewerConnection function, add more logging:
  const createViewerConnection = async (publisherId, offer) => {
    try {
      console.log('🎬 Creating viewer connection for publisher:', publisherId);

      const peerConnection = new RTCPeerConnection({
        iceServers: iceServersRef.current
      });
      peerConnectionsRef.current[publisherId] = peerConnection;

      // Handle incoming stream - ADD DETAILED LOGGING
      peerConnection.ontrack = (event) => {
        console.log('📹 ontrack event fired:', event);
        console.log('🔄 Streams received:', event.streams.length);

        if (event.streams && event.streams.length > 0) {
          console.log('✅ Remote stream received with tracks:');
          event.streams[0].getTracks().forEach(track => {
            console.log(`   - ${track.kind} track:`, track.readyState);
          });

          if (onRemoteStream) {
            onRemoteStream(event.streams[0]);
          }
        } else {
          console.warn('❌ No streams in ontrack event');
        }
      };

      // Add connection state monitoring
      peerConnection.onconnectionstatechange = () => {
        console.log(`🔗 Connection state: ${peerConnection.connectionState}`);
        if (peerConnection.connectionState === 'connected') {
          console.log('✅ WebRTC connection established!');
        }
      };

      peerConnection.oniceconnectionstatechange = () => {
        console.log(`🧊 ICE connection state: ${peerConnection.iceConnectionState}`);
      };

      // Send ICE candidates to publisher
      peerConnection.onicecandidate = (event) => {
        if (event.candidate && socket) {
          console.log('🧊 Sending ICE candidate to publisher');
          socket.emit('webrtc-ice-candidate', {
            targetId: publisherId,
            candidate: event.candidate
          });
        }
      };

      // Set remote description and create answer
      console.log('📨 Setting remote description with offer');
      await peerConnection.setRemoteDescription(offer);

      console.log('📝 Creating answer');
      const answer = await peerConnection.createAnswer();

      console.log('📤 Setting local description with answer');
      await peerConnection.setLocalDescription(answer);

      if (socket) {
        console.log('📤 Sending answer to publisher');
        socket.emit('webrtc-answer', { targetId: publisherId, sdp: answer });
      }

    } catch (error) {
      console.error('❌ Error creating viewer connection:', error);
    }
  };

  return {
    isConnected,
    isStreaming,
    viewersCount,
    startStreaming,
    stopStreaming,
    localStream: localStreamRef.current
  };
};