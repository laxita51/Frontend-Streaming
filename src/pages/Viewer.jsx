import { useEffect, useRef, useState } from 'react';
import { useWebRTC } from '../hooks/useWebRTC';
import './Viewer.css';

export default function Viewer() {
  const videoRef = useRef(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [roomIdInput, setRoomIdInput] = useState('');
  const [joinedRoomId, setJoinedRoomId] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('disconnected');

  const { isConnected } = useWebRTC(joinedRoomId, 'viewer', setRemoteStream);

  useEffect(() => {
    if (videoRef.current && remoteStream) {
      videoRef.current.srcObject = remoteStream;
      setConnectionStatus('connected');
    } else if (joinedRoomId && !remoteStream) {
      setConnectionStatus('connecting');
    }
  }, [remoteStream, joinedRoomId]);

  const handleJoinRoom = () => {
    if (roomIdInput.trim()) {
      setJoinedRoomId(roomIdInput.trim());
      setRemoteStream(null);
      setConnectionStatus('connecting');
    }
  };

  const handleLeaveRoom = () => {
    setJoinedRoomId('');
    setRemoteStream(null);
    setConnectionStatus('disconnected');
  };

  return (
    <div className="viewer-container">
      <div className="viewer-header">
        <h1>Viewer Dashboard</h1>

        {!joinedRoomId ? (
          <div className="room-join">
            <h3>Join a Stream</h3>
            <div className="join-form">
              <input
                type="text"
                placeholder="Enter Room ID from publisher"
                value={roomIdInput}
                onChange={(e) => setRoomIdInput(e.target.value)}
                className="room-input"
              />
              <button onClick={handleJoinRoom} className="join-btn">
                Join Stream
              </button>
            </div>
          </div>
        ) : (
          <div className="room-status">
            <p>Room: <strong>{joinedRoomId}</strong></p>
            <p>Status: <span className={`status-${connectionStatus}`}>
              {connectionStatus.toUpperCase()}
            </span></p>
            <p>WebSocket: <span className={isConnected ? 'status-connected' : 'status-disconnected'}>
              {isConnected ? 'CONNECTED' : 'DISCONNECTED'}
            </span></p>
            <button onClick={handleLeaveRoom} className="leave-btn">
              Leave Room
            </button>
          </div>
        )}
      </div>

      {joinedRoomId ? (
        remoteStream ? (
          <div className="video-container">
            <video
              ref={videoRef}
              className="viewer-video"
              autoPlay
              playsInline
              controls
              muted={false} // Ensure not muted for viewer
              onLoadedData={() => {
                console.log('✅ Video loaded successfully');
                setConnectionStatus('connected');
              }}
              onError={(e) => {
                console.error('❌ Video error:', e);
                setConnectionStatus('error');
              }}
              onPlay={() => console.log('▶️ Video started playing')}
              onPause={() => console.log('⏸️ Video paused')}
            />

            <div className="video-overlay">
              <div className="live-indicator">
                <span className="live-dot"></span>
                LIVE
              </div>
            </div>
          </div>

        ) : (
          <div className="waiting-stream">
            <div className="loading-spinner"></div>
            <p>Status: {connectionStatus.toUpperCase()}</p>
            <p>Waiting for stream from room: {joinedRoomId}</p>
            <p>Make sure:</p>
            <ul>
              <li>Publisher has started the stream</li>
              <li>You're using the correct Room ID</li>
              <li>Both devices are on the same network</li>
            </ul>
          </div>
        )
      ) : (
        <div className="instructions">
          <h3>How to watch a stream:</h3>
          <ol>
            <li>Get the Room ID from the publisher (their user ID)</li>
            <li>Enter it in the field above</li>
            <li>Click "Join Stream"</li>
            <li>Wait for the publisher to start streaming</li>
          </ol>
        </div>
      )}


      <div className="debug-info">
        <h4>Debug Information:</h4>
        <p>Room ID: {joinedRoomId || 'None'}</p>
        <p>WebSocket Connected: {isConnected ? 'Yes' : 'No'}</p>
        <p>Stream Received: {remoteStream ? 'Yes' : 'No'}</p>
        <p>Connection Status: {connectionStatus}</p>
        {remoteStream && (
          <>
            <p>Video Tracks: {remoteStream.getVideoTracks().length}</p>
            <p>Audio Tracks: {remoteStream.getAudioTracks().length}</p>
            <p>Stream Active: {remoteStream.active ? 'Yes' : 'No'}</p>
          </>
        )}
      </div>
    </div>
  );
}