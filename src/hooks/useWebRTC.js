import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const API_BASE_URL = process.env.REACT_APP_BACKEND_URL_BackendURL
console.log("DEBUG",API_BASE_URL)

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
      console.log('📨 Received offer from:', fromId);
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
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }, 
        audio: true 
      });
      
      localStreamRef.current = stream;
      setIsStreaming(true);
      console.log('✅ Media access granted, stream started');
      
      return true;
    } catch (error) {
      console.error('❌ Error accessing media devices:', error);
      alert('Could not access camera/microphone. Please check permissions.');
      return false;
    }
  }, []);

  const stopStreaming = useCallback(() => {
    console.log('🛑 Stopping stream');
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    
    // Close all peer connections
    Object.values(peerConnectionsRef.current).forEach(pc => pc.close());
    peerConnectionsRef.current = {};
    
    setIsStreaming(false);
    setViewersCount(0);
  }, []);

  const createPublisherConnection = async (viewerId) => {
    try {
      if (!localStreamRef.current) {
        console.error('❌ No local stream available');
        return;
      }

      const peerConnection = new RTCPeerConnection({ 
        iceServers: iceServersRef.current 
      });
      peerConnectionsRef.current[viewerId] = peerConnection;

      // Add local stream to connection
      localStreamRef.current.getTracks().forEach(track => {
        peerConnection.addTrack(track, localStreamRef.current);
      });

      // Send ICE candidates to viewer
      peerConnection.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit('webrtc-ice-candidate', { 
            targetId: viewerId, 
            candidate: event.candidate 
          });
        }
      };

      peerConnection.onconnectionstatechange = () => {
        console.log(`Connection state with ${viewerId}:`, peerConnection.connectionState);
      };

      // Create and send offer
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      
      if (socket) {
        console.log('📤 Sending offer to viewer:', viewerId);
        socket.emit('webrtc-offer', { targetId: viewerId, sdp: offer });
      }

    } catch (error) {
      console.error('❌ Error creating publisher connection:', error);
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