/**
 * 4-Player Chess Game Initialization
 * Handles setup and lifecycle of 4-player chess games
 */

import GameController from './four-player/GameController.js';

let gameController = null;

/**
 * Initialize the 4-player chess game
 * Called when a new 4-player game is started
 */
export function initializeChessGame(gameData) {
  const boardElement = document.getElementById('chess-board');
  if (!boardElement) {
    console.error('[4P Chess] Board element not found');
    return null;
  }

  if (gameController) {
    gameController.resetGame();
  } else {
    gameController = new GameController('chess-board');
  }

  if (gameData) {
    gameController.startGame(gameData);
  }

  return gameController;
}

/**
 * Get the current game controller instance
 */
export function getGameController() {
  return gameController;
}

/**
 * Handle incoming 4-player move from server
 */
export function handleChess4pMove(moveData) {
  if (!gameController) {
    console.warn('[4P Chess] No active game');
    return;
  }
  gameController.updateFromMove(moveData);
}

/**
 * Open the chess modal and initialize if needed
 */
export function openChessModal() {
  const modal = document.getElementById('chess-modal');
  if (modal) {
    modal.classList.remove('hidden');
  }
}

/**
 * Close the chess modal
 */
export function closeChessModal() {
  const modal = document.getElementById('chess-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

/**
 * Cleanup game on disconnect or game end
 */
export function cleanupChessGame() {
  if (gameController) {
    gameController.saveGame();
    gameController = null;
  }
}

export default initializeChessGame;
