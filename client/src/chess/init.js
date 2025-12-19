/**
 * 4-Player Chess Game Initialization
 * This script initializes the chess game when the chess modal is opened
 */

import GameController from './GameController';

let gameController = null;

export function initializeChessGame() {
  if (gameController) {
    gameController.resetGame();
    return gameController;
  }

  const boardElement = document.getElementById('chess-board');
  if (!boardElement) {
    console.error('Chess board element not found');
    return null;
  }

  gameController = new GameController('chess-board');
  return gameController;
}

export function getGameController() {
  return gameController;
}

export function openChessGame() {
  const modal = document.getElementById('chess-modal');
  if (modal) {
    modal.classList.remove('hidden');
    if (!gameController) {
      initializeChessGame();
    }
  }
}

export function closeChessGame() {
  const modal = document.getElementById('chess-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

// Hook into existing chess button if it exists
export function attachChessHandlers() {
  const chessButton = document.getElementById('chess-game-button');
  const chessGameModal = document.getElementById('chess-game-modal');
  const chessModal = document.getElementById('chess-modal');
  const closeButton = document.getElementById('chess-close');

  if (chessButton) {
    chessButton.addEventListener('click', () => {
      if (chessGameModal) {
        chessGameModal.classList.remove('hidden');
      }
    });
  }

  // Handle game mode selection
  const createGameBtn = document.getElementById('chess-game-create');
  if (createGameBtn) {
    createGameBtn.addEventListener('click', () => {
      const gameMode = document.getElementById('chess-game-mode')?.value || '2player';
      
      if (chessGameModal) {
        chessGameModal.classList.add('hidden');
      }
      
      if (gameMode === '4player') {
        openChessGame();
      }
    });
  }

  // Handle close button
  if (closeButton) {
    closeButton.addEventListener('click', closeChessGame);
  }
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', attachChessHandlers);
} else {
  attachChessHandlers();
}

export default initializeChessGame;
