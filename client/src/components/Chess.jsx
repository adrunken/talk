import { useEffect, useRef } from 'react';
import { GameController } from '../chess/four-player/GameController';

export default function Chess() {
  const boardRef = useRef(null);
  const gameControllerRef = useRef(null);
  const promotionOverlayRef = useRef(null);

  useEffect(() => {
    if (boardRef.current && !gameControllerRef.current) {
      try {
        gameControllerRef.current = new GameController('chess-board');
      } catch (err) {
        console.error('Failed to initialize chess game:', err);
      }
    }

    return () => {
      // Cleanup on unmount
      if (gameControllerRef.current) {
        gameControllerRef.current.saveGame();
      }
    };
  }, []);

  return (
    <div className="chess-container">
      {/* Chess Board */}
      <div id="chess-board" ref={boardRef} className="chess-board-14x14"></div>

      {/* Game Status and Controls */}
      <div className="chess-controls">
        <div id="chess-status" className="chess-status">
          Turn: Red
        </div>
        
        <div className="chess-actions">
          <button id="chess-confirm-move" className="chess-button">Confirm</button>
          <button id="chess-resign" className="chess-button resign-btn">Resign</button>
          <button id="chess-close" className="chess-button close-btn">Close</button>
        </div>
      </div>

      {/* Player Displays */}
      <div id="chess-4player-players" className="chess-players-display">
        <div id="chess-4p-white" className="player-display">White: 0</div>
        <div id="chess-4p-red" className="player-display">Red: 0</div>
        <div id="chess-4p-black" className="player-display">Black: 0</div>
        <div id="chess-4p-blue" className="player-display">Blue: 0</div>
      </div>

      {/* Promotion Overlay */}
      <div id="promotion-overlay" className="promotion-overlay hidden">
        <div className="promotion-modal">
          <h3>Promote Pawn</h3>
          <div className="promotion-overlay-options"></div>
          <button id="promotion-cancel" className="cancel-btn">Cancel</button>
        </div>
      </div>

      <style>{`
        .chess-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 1rem;
          padding: 1rem;
          background-color: #2a3f5f;
          border-radius: 8px;
          min-height: 600px;
        }

        .chess-board-14x14 {
          display: grid;
          gap: 0;
          background-color: #555;
          padding: 0;
          border-radius: 4px;
          grid-template-columns: repeat(14, 1fr);
        }

        .chess-controls {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          align-items: center;
          width: 100%;
        }

        .chess-status {
          font-size: 1.1rem;
          color: #fff;
          font-weight: 600;
        }

        .chess-actions {
          display: flex;
          gap: 0.5rem;
        }

        .chess-button {
          padding: 0.5rem 1rem;
          background-color: #3498db;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 600;
          transition: background-color 0.2s;
        }

        .chess-button:hover {
          background-color: #2980b9;
        }

        .resign-btn {
          background-color: #e74c3c;
        }

        .resign-btn:hover {
          background-color: #c0392b;
        }

        .close-btn {
          background-color: #7f8c8d;
        }

        .close-btn:hover {
          background-color: #6c7a7e;
        }

        .chess-players-display {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 0.5rem;
          width: 100%;
          max-width: 400px;
        }

        .player-display {
          padding: 0.5rem;
          background-color: #34495e;
          border-radius: 4px;
          color: #ecf0f1;
          text-align: center;
          font-weight: 600;
        }

        .promotion-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .promotion-overlay.hidden {
          display: none;
        }

        .promotion-modal {
          background-color: #2c3e50;
          padding: 2rem;
          border-radius: 8px;
          text-align: center;
          color: white;
        }

        .promotion-modal h3 {
          margin-bottom: 1.5rem;
          font-size: 1.5rem;
        }

        .promotion-overlay-options {
          display: flex;
          gap: 1rem;
          justify-content: center;
          margin-bottom: 1.5rem;
        }

        .promotion-choice {
          width: 60px;
          height: 60px;
          background-color: #34495e;
          border: 2px solid #95a5a6;
          border-radius: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 2rem;
          transition: all 0.2s;
        }

        .promotion-choice:hover {
          background-color: #3d5470;
          border-color: #ecf0f1;
        }

        .cancel-btn {
          padding: 0.5rem 1.5rem;
          background-color: #e74c3c;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-weight: 600;
        }

        .cancel-btn:hover {
          background-color: #c0392b;
        }
      `}</style>
    </div>
  );
}
