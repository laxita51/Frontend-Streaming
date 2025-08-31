import { useEffect, useRef, useState } from 'react';
import { useWebRTC } from '../hooks/useWebRTC';
import './Publisher.css';

export default function Publisher() {
  const videoRef = useRef(null);
  const [streamStarted, setStreamStarted] = useState(false);
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const roomId = user.id;

  const { 
    isConnected, 
    isStreaming, 
    viewersCount, 
    startStreaming, 
    stopStreaming, 
    localStream 
  } = useWebRTC(roomId, 'publisher');

  useEffect(() => {
  if (videoRef.current && localStream) {
    console.log('📹 Publisher stream tracks:', localStream.getTracks().length);
    localStream.getTracks().forEach(track => {
      console.log(`   - ${track.kind}: ${track.readyState}`);
    });
    videoRef.current.srcObject = localStream;
  }
}, [localStream]);

  const handleStartStream = async () => {
    const success = await startStreaming();
    setStreamStarted(success);
  };

  const handleStopStream = () => {
    stopStreaming();
    setStreamStarted(false);
  };

  return (
    <div className="publisher-container">
      <div className="publisher-header">
        <h1>Publisher Dashboard</h1>
        <p>Room ID: <strong>{roomId}</strong></p>
        <p>Connection: <span className={isConnected ? 'status-connected' : 'status-disconnected'}>
          {isConnected ? 'Connected' : 'Disconnected'}
        </span></p>
        <p>Status: <span className={isStreaming ? 'status-live' : 'status-offline'}>
          {isStreaming ? 'LIVE' : 'OFFLINE'}
        </span></p>
      </div>
      
      <div className="video-container">
        {streamStarted ? (
          <video
            ref={videoRef}
            className="publisher-video"
            autoPlay
            playsInline
            muted
          />
        ) : (
          <div className="video-placeholder">
            <p>Stream not started</p>
            <button onClick={handleStartStream} className="start-stream-btn">
              Start Stream
            </button>
          </div>
        )}
        
        {isStreaming && (
          <div className="video-overlay">
            <div className="live-indicator">
              <span className="live-dot"></span>
              LIVE
            </div>
            <div className="viewers-count">
              👥 {viewersCount} viewers
            </div>
          </div>
        )}
      </div>
      
      <div className="controls">
        {!streamStarted ? (
          <button onClick={handleStartStream} className="control-button primary">
            Start Streaming
          </button>
        ) : (
          <button onClick={handleStopStream} className="control-button stop">
            Stop Streaming
          </button>
        )}
        
        <div className="room-info">
          <h3>Share this Room ID with viewers:</h3>
          <div className="room-id-display">
            <code>{roomId}</code>
            <button 
              onClick={() => navigator.clipboard.writeText(roomId)}
              className="copy-btn"
            >
              Copy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}