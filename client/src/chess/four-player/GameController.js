/**
 * 4-Player Chess Game Controller
 * Main integration point between the game engine, board renderer, move handler, and DOM
 * Handles UI updates, event listeners, and WebSocket communication
 */

import { FourPlayerChess, PIECE_TYPES, PLAYERS, PLAYER_NAMES, PLAYER_COLORS } from './FourPlayerChess.js';
import { BoardRenderer } from './BoardRenderer.js';
import { MoveHandler } from './MoveHandler.js';

export class GameController {
  constructor(boardElementId, gameState = null) {
    this.boardElement = document.getElementById(boardElementId);
    
    if (!this.boardElement) {
      throw new Error(`Board element with id "${boardElementId}" not found`);
    }

    this.game = gameState ? this.restoreGameState(gameState) : new FourPlayerChess();
    this.boardRenderer = new BoardRenderer(this.boardElement, this.game);
    this.moveHandler = new MoveHandler(this.game, this.boardRenderer, this.onMove.bind(this));

    this.gameId = null;
    this.currentPlayer = null;
    this.playerMap = {}; // Maps player index to username
    this.isLocalGame = true; // Set to false when connected to server
    
    this.UIElements = {
      statusDisplay: document.getElementById('chess-status'),
      fourPlayerContainer: document.getElementById('chess-4player-players'),
      playerDisplays: {
        0: document.getElementById('chess-4p-white'),
        1: document.getElementById('chess-4p-red'),
        2: document.getElementById('chess-4p-black'),
        3: document.getElementById('chess-4p-blue'),
      },
      playerTimers: {
        0: document.getElementById('chess-white-timer'),
        1: document.getElementById('chess-red-timer'),
        2: document.getElementById('chess-black-timer'),
        3: document.getElementById('chess-blue-timer'),
      },
      confirmBtn: document.getElementById('chess-confirm-move'),
      resignBtn: document.getElementById('chess-resign'),
      closeBtn: document.getElementById('chess-close'),
      promotionOverlay: document.getElementById('promotion-overlay'),
    };

    this.attachEventListeners();
    this.boardRenderer.initialize();
    this.updateUI();
  }

  attachEventListeners() {
    // Board interaction
    this.boardElement.addEventListener('click', (e) => this.handleBoardClick(e));
    this.boardElement.addEventListener('dragstart', (e) => this.handleDragStart(e));
    this.boardElement.addEventListener('dragover', (e) => this.handleDragOver(e));
    this.boardElement.addEventListener('drop', (e) => this.handleDrop(e));
    this.boardElement.addEventListener('dragend', (e) => this.handleDragEnd(e));

    // Control buttons
    if (this.UIElements.confirmBtn) {
      this.UIElements.confirmBtn.addEventListener('click', () => this.handleConfirmMove());
    }
    if (this.UIElements.resignBtn) {
      this.UIElements.resignBtn.addEventListener('click', () => this.handleResign());
    }
    if (this.UIElements.closeBtn) {
      this.UIElements.closeBtn.addEventListener('click', () => this.closeGame());
    }

    this.setupPromotionHandlers();
  }

  handleBoardClick(event) {
    if (!this.isCurrentPlayerTurn()) {
      return;
    }

    const square = this.boardRenderer.getSquareAtEvent(event);
    if (square) {
      const [rank, file] = square;
      this.moveHandler.selectSquare(rank, file);
    }
  }

  handleDragStart(event) {
    if (!this.isCurrentPlayerTurn()) {
      return;
    }

    const square = this.boardRenderer.getSquareAtEvent(event);
    if (square) {
      const [rank, file] = square;
      this.moveHandler.startDrag(rank, file, event);
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }

  handleDrop(event) {
    event.preventDefault();
    if (!this.isCurrentPlayerTurn()) {
      return;
    }

    const square = this.boardRenderer.getSquareAtEvent(event);
    if (square && this.moveHandler.draggedPiece) {
      const [toRank, toFile] = square;
      const { rank: fromRank, file: fromFile } = this.moveHandler.draggedPiece;
      this.moveHandler.attemptMove(fromRank, fromFile, toRank, toFile);
    }
    this.moveHandler.endDrag();
  }

  handleDragEnd(event) {
    this.moveHandler.endDrag();
  }

  handleConfirmMove() {
    // For now, this is a placeholder - actual implementation depends on UI flow
  }

  handleResign() {
    if (confirm('Are you sure you want to resign from this game?')) {
      this.sendResignMessage();
      this.moveHandler.resign();
      this.updateUI();
    }
  }

  closeGame() {
    const modal = document.getElementById('chess-modal');
    if (modal) {
      modal.classList.add('hidden');
    }
  }

  setupPromotionHandlers() {
    if (!this.UIElements.promotionOverlay) {
      return;
    }

    const optionsContainer = this.UIElements.promotionOverlay.querySelector('.promotion-overlay-options');
    if (!optionsContainer) {
      return;
    }

    optionsContainer.innerHTML = '';

    const promotionTypes = [PIECE_TYPES.QUEEN, PIECE_TYPES.ROOK, PIECE_TYPES.BISHOP, PIECE_TYPES.KNIGHT];
    promotionTypes.forEach(type => {
      const button = document.createElement('div');
      button.className = 'promotion-choice';
      const playerInitial = this.getPlayerInitial(this.game.getCurrentPlayer());
      button.innerHTML = `<div class="piece piece-${playerInitial}${type}"></div>`;
      button.addEventListener('click', () => this.completePromotion(type));
      optionsContainer.appendChild(button);
    });

    const cancelBtn = this.UIElements.promotionOverlay.querySelector('#promotion-cancel');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.cancelPromotion());
    }
  }

  getPlayerInitial(playerIndex) {
    const initials = { 0: 'w', 1: 'r', 2: 'b', 3: 'g' };
    return initials[playerIndex] || '';
  }

  showPromotionPrompt(fromNotation, toNotation) {
    if (this.UIElements.promotionOverlay) {
      this.UIElements.promotionOverlay.classList.remove('hidden');
      this.currentPromotionMove = { from: fromNotation, to: toNotation };
    }
  }

  completePromotion(promotionType) {
    if (this.currentPromotionMove) {
      const result = this.moveHandler.completePawnPromotion(
        this.currentPromotionMove.from,
        this.currentPromotionMove.to,
        promotionType
      );

      if (result.success) {
        this.hidePromotionPrompt();
        this.currentPromotionMove = null;
        this.updateUI();

        // Send move to server if not a local game
        if (!this.isLocalGame && result.lastMove) {
          this.sendMoveMessage(result.lastMove);
        }
      }
    }
  }

  cancelPromotion() {
    this.hidePromotionPrompt();
    this.currentPromotionMove = null;
    this.moveHandler.deselectSquare();
  }

  hidePromotionPrompt() {
    if (this.UIElements.promotionOverlay) {
      this.UIElements.promotionOverlay.classList.add('hidden');
    }
  }

  onMove(result) {
    if (result.requiresPromotion) {
      this.showPromotionPrompt(result.from, result.to);
    } else if (result.success) {
      this.updateUI();

      // Send move to server if not a local game
      if (!this.isLocalGame && result.lastMove) {
        this.sendMoveMessage(result.lastMove);
      }

      if (this.game.isGameOver()) {
        this.handleGameOver();
      }
    }
  }

  isCurrentPlayerTurn() {
    if (this.isLocalGame) {
      return true;
    }
    const currentPlayer = this.game.getCurrentPlayer();
    return this.playerMap[currentPlayer] === this.currentPlayer;
  }

  updateUI() {
    this.updateStatusDisplay();
    this.updatePlayerDisplays();
    this.updateConfirmButton();
  }

  updateStatusDisplay() {
    const status = this.game.getGameStatus();
    const playerIndex = this.game.getCurrentPlayer();
    const playerName = PLAYER_NAMES[playerIndex];

    let statusText = '';
    if (status.isGameOver) {
      const winner = this.game.getWinner();
      const winnerName = PLAYER_NAMES[winner];
      statusText = `Game Over - Winner: ${winnerName}`;
    } else if (status.isCheckmate) {
      statusText = `${playerName} is checkmated!`;
    } else if (status.isCheck) {
      statusText = `${playerName} is in check`;
    } else {
      statusText = `Turn: ${playerName}`;
    }

    if (this.UIElements.statusDisplay) {
      this.UIElements.statusDisplay.textContent = statusText;
    }
  }

  updatePlayerDisplays() {
    if (this.UIElements.fourPlayerContainer) {
      this.UIElements.fourPlayerContainer.style.display = 'block';
    }

    for (let playerIndex = 0; playerIndex < 4; playerIndex++) {
      const display = this.UIElements.playerDisplays[playerIndex];
      if (display) {
        const playerName = PLAYER_NAMES[playerIndex];
        const score = this.game.scores[playerIndex];
        const isEliminated = this.game.eliminatedPlayers.has(playerIndex);
        const status = isEliminated ? ' (eliminated)' : '';
        display.textContent = `${playerName}: ${score} points${status}`;
      }
    }
  }

  updateConfirmButton() {
    // Confirm button is typically disabled in 4-player games
    // Re-enable if needed for specific workflows
  }

  handleGameOver() {
    const winner = this.game.getWinner();
    const winnerName = PLAYER_NAMES[winner];
    alert(`Game Over! ${winnerName} wins!`);
  }

  /**
   * Initialize a new 4-player game from server data
   */
  startGame(gameData) {
    this.gameId = gameData.game_id;
    this.playerMap = gameData.players; // { 0: username1, 1: username2, 2: username3, 3: username4 }
    this.currentPlayer = gameData.currentPlayer; // Username of current player
    this.isLocalGame = false;
    
    // Reset the game
    this.game = new FourPlayerChess();
    this.boardRenderer = new BoardRenderer(this.boardElement, this.game);
    this.moveHandler = new MoveHandler(this.game, this.boardRenderer, this.onMove.bind(this));
    this.boardRenderer.initialize();
    
    this.updateUI();

    // Show the modal
    const modal = document.getElementById('chess-modal');
    if (modal) {
      modal.classList.remove('hidden');
    }
  }

  /**
   * Update game state from server move
   */
  updateFromMove(moveData) {
    // moveData should contain: { from: 'a1', to: 'b2', game_id, player_index }
    if (moveData.game_id !== this.gameId) {
      return;
    }

    const { from, to } = moveData;
    const result = this.game.makeMove(from, to);

    if (result.success) {
      this.boardRenderer.render();
      this.moveHandler.deselectSquare();
      this.updateUI();
    }
  }

  /**
   * Send a move to the server via WebSocket
   */
  sendMoveMessage(move) {
    if (!window.ws || window.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected');
      return;
    }

    const msg = {
      type: 'chess_4p_move',
      game_id: this.gameId,
      from: move.from,
      to: move.to,
      player_index: this.game.turnIndex,
    };

    window.ws.send(JSON.stringify(msg));
  }

  /**
   * Send a resign message to the server
   */
  sendResignMessage() {
    if (!window.ws || window.ws.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not connected');
      return;
    }

    const msg = {
      type: 'chess_4p_resign',
      game_id: this.gameId,
    };

    window.ws.send(JSON.stringify(msg));
  }

  /**
   * Get the current game state
   */
  getGameState() {
    return this.game.getGameState();
  }

  /**
   * Restore game state from saved data
   */
  restoreGameState(gameState) {
    const game = new FourPlayerChess();
    
    if (gameState.board) {
      game.board = gameState.board.map(row => [...row]);
    }
    if (gameState.turnIndex !== undefined) {
      game.turnIndex = gameState.turnIndex;
    }
    if (gameState.eliminated) {
      game.eliminatedPlayers = new Set(gameState.eliminated);
    }
    if (gameState.scores) {
      game.scores = { ...gameState.scores };
    }
    if (gameState.moveHistory) {
      game.moveHistory = [...gameState.moveHistory];
    }

    return game;
  }

  /**
   * Reset the game to initial state
   */
  resetGame() {
    this.game = new FourPlayerChess();
    this.boardRenderer = new BoardRenderer(this.boardElement, this.game);
    this.moveHandler = new MoveHandler(this.game, this.boardRenderer, this.onMove.bind(this));
    this.boardRenderer.initialize();
    this.updateUI();
  }

  /**
   * Save game state to local storage
   */
  saveGame() {
    const state = this.getGameState();
    localStorage.setItem('chess4pGameState', JSON.stringify(state));
    return state;
  }

  /**
   * Load game state from local storage
   */
  loadGame() {
    const saved = localStorage.getItem('chess4pGameState');
    if (saved) {
      const state = JSON.parse(saved);
      this.game = this.restoreGameState(state);
      this.boardRenderer.render();
      this.updateUI();
      return state;
    }
    return null;
  }
}

export default GameController;
