/**
 * Move Handler and Game Controller
 * Manages piece selection, move validation, and game flow
 */

import { PIECE_TYPES, PLAYERS } from './FourPlayerChess';

export class MoveHandler {
  constructor(game, boardRenderer, onMoveCallback) {
    this.game = game;
    this.boardRenderer = boardRenderer;
    this.onMoveCallback = onMoveCallback;
    this.selectedSquare = null;
    this.legalMoves = [];
    this.draggedPiece = null;
    this.dragOffset = { x: 0, y: 0 };
  }

  selectSquare(rank, file) {
    const piece = this.game.getPiece(rank, file);
    const currentPlayer = this.game.getCurrentPlayer();

    // If clicking on a square with a move target
    if (this.selectedSquare) {
      const [selectedRank, selectedFile] = this.selectedSquare;

      // If clicking the same square, deselect
      if (selectedRank === rank && selectedFile === file) {
        this.deselectSquare();
        return;
      }

      // Try to move to the clicked square
      const selectedPiece = this.game.getPiece(selectedRank, selectedFile);
      if (
        selectedPiece &&
        selectedPiece.player === currentPlayer &&
        this.game.canMovePiece(selectedRank, selectedFile, rank, file, currentPlayer)
      ) {
        this.attemptMove(selectedRank, selectedFile, rank, file);
        return;
      }

      // If clicking a piece of the current player, select it instead
      if (piece && piece.player === currentPlayer) {
        this.selectPieceSquare(rank, file);
        return;
      }

      // Otherwise deselect
      this.deselectSquare();
      return;
    }

    // If no selection and clicking a piece of the current player
    if (piece && piece.player === currentPlayer) {
      this.selectPieceSquare(rank, file);
    }
  }

  selectPieceSquare(rank, file) {
    this.selectedSquare = [rank, file];
    this.boardRenderer.selectSquare(rank, file);

    // Show legal moves for this piece
    const piece = this.game.getPiece(rank, file);
    this.legalMoves = [];

    for (let tr = 0; tr < 14; tr++) {
      for (let tf = 0; tf < 14; tf++) {
        if (this.game.canMovePiece(rank, file, tr, tf, this.game.getCurrentPlayer())) {
          const toNotation = this.game.coordsToNotation(tr, tf);
          this.legalMoves.push({ to: toNotation, from: this.game.coordsToNotation(rank, file) });
        }
      }
    }

    this.boardRenderer.showLegalMoves(this.legalMoves);
  }

  deselectSquare() {
    this.selectedSquare = null;
    this.legalMoves = [];
    this.boardRenderer.deselectSquare();
    this.boardRenderer.clearLegalMoves();
  }

  attemptMove(fromRank, fromFile, toRank, toFile) {
    const fromNotation = this.game.coordsToNotation(fromRank, fromFile);
    const toNotation = this.game.coordsToNotation(toRank, toFile);

    const piece = this.game.getPiece(fromRank, fromFile);

    // Check for pawn promotion
    if (piece.type === PIECE_TYPES.PAWN && this.shouldPromote(toRank, piece.player)) {
      this.handlePawnPromotion(fromNotation, toNotation);
      return;
    }

    // Execute the move
    const result = this.game.makeMove(fromNotation, toNotation);

    if (result.success) {
      this.boardRenderer.highlightLastMove(fromNotation, toNotation);
      this.deselectSquare();
      this.boardRenderer.update();

      // Check for check
      const newPlayer = this.game.getCurrentPlayer();
      if (this.game.isKingInCheck(newPlayer)) {
        this.boardRenderer.highlightCheck(newPlayer);
      }

      if (this.onMoveCallback) {
        this.onMoveCallback(result);
      }
    }
  }

  handlePawnPromotion(fromNotation, toNotation) {
    // Emit event or callback to show promotion UI
    if (this.onMoveCallback) {
      this.onMoveCallback({
        success: false,
        needsPromotion: true,
        fromNotation,
        toNotation,
      });
    }
  }

  shouldPromote(toRank, player) {
    // Check if pawn reached promotion rank
    if (player === PLAYERS.BLUE && toRank === 13) return true;
    if (player === PLAYERS.RED && toRank === 0) return true;
    if (player === PLAYERS.YELLOW && toRank === 13) return true;
    if (player === PLAYERS.GREEN && toRank === 0) return true;
    return false;
  }

  completePawnPromotion(fromNotation, toNotation, promotionType) {
    const result = this.game.makeMove(fromNotation, toNotation, promotionType);

    if (result.success) {
      this.boardRenderer.highlightLastMove(fromNotation, toNotation);
      this.deselectSquare();
      this.boardRenderer.update();

      // Check for check
      const newPlayer = this.game.getCurrentPlayer();
      if (this.game.isKingInCheck(newPlayer)) {
        this.boardRenderer.highlightCheck(newPlayer);
      }

      if (this.onMoveCallback) {
        this.onMoveCallback(result);
      }
    }

    return result;
  }

  startDrag(rank, file, event) {
    const piece = this.game.getPiece(rank, file);
    if (piece && piece.player === this.game.getCurrentPlayer()) {
      this.draggedPiece = { rank, file, piece };

      const square = this.boardRenderer.getSquareElement(rank, file);
      if (square) {
        square.classList.add('dragging');
      }
    }
  }

  endDrag() {
    if (this.draggedPiece) {
      const square = this.boardRenderer.getSquareElement(
        this.draggedPiece.rank,
        this.draggedPiece.file
      );
      if (square) {
        square.classList.remove('dragging');
      }
      this.draggedPiece = null;
    }
  }

  resign() {
    const player = this.game.getCurrentPlayer();
    const playerName = this.game.getPlayerName(player);

    // Add to move history
    this.game.moveHistory.push({
      type: 'resign',
      player,
      playerName,
    });

    // Mark player as eliminated
    this.game.eliminatedPlayers.add(player);

    // Advance turn
    this.game.advanceTurn();

    if (this.onMoveCallback) {
      this.onMoveCallback({
        success: true,
        type: 'resign',
        player,
      });
    }

    this.boardRenderer.update();
  }

  undo() {
    if (this.game.moveHistory.length === 0) return false;

    const lastMove = this.game.moveHistory.pop();

    // Reconstruct board state - this is simplified
    // In a real app, you'd maintain full board history
    const newGame = new this.game.constructor();
    for (const move of this.game.moveHistory) {
      if (move.type !== 'resign') {
        // Simple replay - doesn't handle all edge cases
        // This is a placeholder implementation
      }
    }

    this.boardRenderer.update();
    return true;
  }

  getGameStatus() {
    const currentPlayer = this.game.getCurrentPlayer();
    const playerName = this.game.getPlayerName(currentPlayer);
    const isCheck = this.game.isKingInCheck(currentPlayer);

    let status = `Turn: ${playerName}`;

    if (this.game.isGameOver()) {
      const winner = this.game.getWinner();
      status = `Game Over! Winner: ${this.game.getPlayerName(winner)}`;
    } else if (isCheck) {
      status += ' - CHECK!';
    }

    return status;
  }

  getScoreBoard() {
    const scores = {};
    for (let i = 0; i < 4; i++) {
      const playerName = this.game.getPlayerName(i);
      scores[playerName] = {
        score: this.game.scores[i],
        eliminated: this.game.eliminatedPlayers.has(i),
      };
    }
    return scores;
  }
}
