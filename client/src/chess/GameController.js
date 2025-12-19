/**
 * Game Controller
 * Main integration point for the 4-player chess game
 * Handles UI interactions, state management, and event handling
 */

import { FourPlayerChess, PIECE_TYPES, PLAYERS, PLAYER_NAMES } from './FourPlayerChess';
import { BoardRenderer } from './BoardRenderer';
import { MoveHandler } from './MoveHandler';

export class GameController {
  constructor(boardElementId) {
    this.boardElement = document.getElementById(boardElementId);
    this.game = new FourPlayerChess();
    this.boardRenderer = new BoardRenderer(this.boardElement, this.game);
    this.moveHandler = new MoveHandler(this.game, this.boardRenderer, this.onMove.bind(this));

    this.UIElements = {
      statusDisplay: null,
      scoreBoard: null,
      playerNames: {},
      timers: {},
    };

    this.setupUIElements();
    this.attachEventListeners();
    this.boardRenderer.initialize();
    this.updateUI();
  }

  setupUIElements() {
    // Find and store references to UI elements
    this.UIElements.statusDisplay = document.getElementById('chess-status');

    // Player names and timers
    const playerConfigs = [
      { color: 'white', nameId: 'chess-white-name', timerId: 'chess-white-timer' },
      { color: 'red', nameId: 'chess-red-name', timerId: 'chess-red-timer' },
      { color: 'black', nameId: 'chess-black-name', timerId: 'chess-black-timer' },
      { color: 'blue', nameId: 'chess-blue-name', timerId: 'chess-blue-timer' },
    ];

    playerConfigs.forEach(config => {
      this.UIElements.playerNames[config.color] = document.getElementById(config.nameId);
      this.UIElements.timers[config.color] = document.getElementById(config.timerId);
    });

    // 4-player display elements
    this.UIElements.fourPlayerStatus = document.getElementById('chess-4player-players');
    this.UIElements.fourPlayerDisplays = {
      white: document.getElementById('chess-4p-white'),
      red: document.getElementById('chess-4p-red'),
      black: document.getElementById('chess-4p-black'),
      blue: document.getElementById('chess-4p-blue'),
    };
  }

  attachEventListeners() {
    // Board click handler
    this.boardElement.addEventListener('click', (e) => this.handleBoardClick(e));

    // Piece drag handlers
    this.boardElement.addEventListener('dragstart', (e) => this.handleDragStart(e));
    this.boardElement.addEventListener('dragover', (e) => this.handleDragOver(e));
    this.boardElement.addEventListener('drop', (e) => this.handleDrop(e));
    this.boardElement.addEventListener('dragend', (e) => this.handleDragEnd(e));

    // Move buttons
    const confirmBtn = document.getElementById('chess-confirm-move');
    const resignBtn = document.getElementById('chess-resign');
    const closeBtn = document.getElementById('chess-close');

    if (confirmBtn) confirmBtn.addEventListener('click', () => this.handleConfirmMove());
    if (resignBtn) resignBtn.addEventListener('click', () => this.handleResign());
    if (closeBtn) closeBtn.addEventListener('click', () => this.closeGame());

    // Promotion modal handlers
    const promotionPanel = document.getElementById('promotion-overlay');
    if (promotionPanel) {
      this.setupPromotionHandlers();
    }
  }

  handleBoardClick(event) {
    const square = this.boardRenderer.getSquareAtEvent(event);
    if (square) {
      const [rank, file] = square;
      this.moveHandler.selectSquare(rank, file);
    }
  }

  handleDragStart(event) {
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
    // This is called when the confirm move button is clicked
    // Implementation depends on how premoves are handled
  }

  handleResign() {
    if (confirm('Are you sure you want to resign?')) {
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
    // Find promotion choice buttons and set up handlers
    const promotionOverlay = document.getElementById('promotion-overlay');
    const promotionPanel = promotionOverlay?.querySelector('.promotion-overlay-panel');

    // Create promotion choices
    if (promotionPanel) {
      const optionsContainer = promotionPanel.querySelector('.promotion-overlay-options');
      if (optionsContainer) {
        optionsContainer.innerHTML = '';

        const promotionTypes = [PIECE_TYPES.QUEEN, PIECE_TYPES.ROOK, PIECE_TYPES.BISHOP, PIECE_TYPES.KNIGHT];
        promotionTypes.forEach(type => {
          const button = document.createElement('div');
          button.className = 'promotion-choice';
          button.innerHTML = `<div class="promotion-piece piece-b${type}"></div>`;
          button.addEventListener('click', () => this.completePromotion(type));
          optionsContainer.appendChild(button);
        });

        const cancelBtn = promotionPanel.querySelector('#promotion-cancel');
        if (cancelBtn) {
          cancelBtn.addEventListener('click', () => this.cancelPromotion());
        }
      }
    }
  }

  showPromotionPrompt(fromNotation, toNotation) {
    const promotionOverlay = document.getElementById('promotion-overlay');
    if (promotionOverlay) {
      promotionOverlay.classList.remove('hidden');
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
      }
    }
  }

  cancelPromotion() {
    this.hidePromotionPrompt();
    this.currentPromotionMove = null;
    this.moveHandler.deselectSquare();
  }

  hidePromotionPrompt() {
    const promotionOverlay = document.getElementById('promotion-overlay');
    if (promotionOverlay) {
      promotionOverlay.classList.add('hidden');
    }
  }

  onMove(result) {
    if (result.requiresPromotion) {
      this.showPromotionPrompt(result.from, result.to);
    } else if (result.success) {
      this.updateUI();

      if (this.game.isGameOver()) {
        this.handleGameOver();
      }
    }
  }

  updateUI() {
    const status = this.game.getGameStatus();

    // Update status display
    if (this.UIElements.statusDisplay) {
      this.UIElements.statusDisplay.textContent = status.message || 
        `Turn: ${status.playerName}`;
    }

    // Update player display
    this.updatePlayerDisplay();

    // Update 4-player specific display
    this.updateFourPlayerDisplay();
  }

  updatePlayerDisplay() {
    const playerNames = [PLAYERS.BLUE, PLAYERS.YELLOW, PLAYERS.RED, PLAYERS.GREEN];
    const colors = ['blue', 'yellow', 'red', 'green'];

    playerNames.forEach((player, index) => {
      const color = colors[index];
      const nameElement = this.UIElements.playerNames[color];
      const status = this.game.eliminatedPlayers.has(player) ? ' (eliminated)' : '';

      if (nameElement) {
        nameElement.textContent = `Player ${index + 1}${status}`;
      }
    });
  }

  updateFourPlayerDisplay() {
    if (this.UIElements.fourPlayerStatus) {
      this.UIElements.fourPlayerStatus.style.display = 'block';
    }

    const colors = ['blue', 'yellow', 'red', 'green'];
    colors.forEach((color, index) => {
      const display = this.UIElements.fourPlayerDisplays[color];
      const score = this.game.scores[index];
      if (display) {
        display.textContent = `Player ${index + 1} - Score: ${score}`;
      }
    });
  }

  handleGameOver() {
    const winner = this.game.getWinner();
    const winnerName = this.game.getPlayerName(winner);
    
    alert(`Game Over! ${winnerName} wins!`);
    
    // Show final scores
    const scoreboard = this.getFinalScoreboard();
    console.log('Final Scores:', scoreboard);
  }

  getFinalScoreboard() {
    const scores = [];
    for (let i = 0; i < 4; i++) {
      scores.push({
        player: this.game.getPlayerName(i),
        score: this.game.scores[i],
        eliminated: this.game.eliminatedPlayers.has(i),
      });
    }
    return scores.sort((a, b) => b.score - a.score);
  }

  resetGame() {
    this.game = new FourPlayerChess();
    this.boardRenderer = new BoardRenderer(this.boardElement, this.game);
    this.moveHandler = new MoveHandler(this.game, this.boardRenderer, this.onMove.bind(this));
    this.boardRenderer.initialize();
    this.updateUI();
  }

  getGameState() {
    return this.game.getGameState();
  }

  saveGame() {
    const state = this.getGameState();
    localStorage.setItem('chess4pGameState', JSON.stringify(state));
    return state;
  }

  loadGame() {
    const saved = localStorage.getItem('chess4pGameState');
    if (saved) {
      // TODO: Implement game state restoration
      console.log('Saved game found:', JSON.parse(saved));
    }
  }
}

export default GameController;
