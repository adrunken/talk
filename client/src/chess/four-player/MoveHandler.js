/**
 * 4-Player Chess Move Handler
 * Handles move selection, validation, and execution
 */

export class MoveHandler {
  constructor(game, boardRenderer, onMoveCallback) {
    this.game = game;
    this.boardRenderer = boardRenderer;
    this.onMoveCallback = onMoveCallback;
    this.selectedFrom = null;
    this.draggedPiece = null;
  }

  selectSquare(rank, file) {
    const piece = this.game.getPiece(rank, file);
    const currentPlayer = this.game.getCurrentPlayer();

    if (!piece || piece.player !== currentPlayer) {
      this.selectedFrom = null;
      this.boardRenderer.clearSelection();
      return;
    }

    if (this.selectedFrom && this.selectedFrom[0] === rank && this.selectedFrom[1] === file) {
      this.deselectSquare();
      return;
    }

    this.selectedFrom = [rank, file];
    this.boardRenderer.selectSquare(rank, file);
    
    const from = this.game.coordsToNotation(rank, file);
    const available = this.game.getAvailableMoves(currentPlayer)
      .filter(m => m.from === from)
      .map(m => this.game.notationToCoords(m.to));
    
    this.boardRenderer.highlightMoves(available);
  }

  deselectSquare() {
    this.selectedFrom = null;
    this.boardRenderer.clearSelection();
  }

  startDrag(rank, file, event) {
    const piece = this.game.getPiece(rank, file);
    const currentPlayer = this.game.getCurrentPlayer();

    if (!piece || piece.player !== currentPlayer) {
      return;
    }

    this.draggedPiece = { rank, file };
  }

  endDrag() {
    this.draggedPiece = null;
  }

  attemptMove(fromRank, fromFile, toRank, toFile) {
    const fromNotation = this.game.coordsToNotation(fromRank, fromFile);
    const toNotation = this.game.coordsToNotation(toRank, toFile);

    const result = this.game.makeMove(fromNotation, toNotation);
    
    if (result.requiresPromotion) {
      this.onMoveCallback(result);
    } else if (result.success) {
      this.boardRenderer.render();
      this.deselectSquare();
      this.onMoveCallback(result);
    } else {
      console.warn('[MoveHandler] Move failed:', result.error);
    }
  }

  completePawnPromotion(fromNotation, toNotation, promotionType) {
    const result = this.game.makeMove(fromNotation, toNotation, promotionType);
    
    if (result.success) {
      this.boardRenderer.render();
      this.deselectSquare();
    }
    
    return result;
  }

  resign() {
    const currentPlayer = this.game.getCurrentPlayer();
    this.game.eliminatedPlayers.add(currentPlayer);
    this.game.advanceTurn();
    this.boardRenderer.render();
  }
}
