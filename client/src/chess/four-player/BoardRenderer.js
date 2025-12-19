/**
 * 4-Player Chess Board Renderer
 * Renders the 14x14 board with pieces for 4 players
 */

export class BoardRenderer {
  constructor(boardElementId, game) {
    this.boardElement = typeof boardElementId === 'string' 
      ? document.getElementById(boardElementId) 
      : boardElementId;
    this.game = game;
    this.selectedSquare = null;
    this.validMoves = [];
  }

  initialize() {
    if (!this.boardElement) {
      console.warn('[BoardRenderer] Board element not found');
      return;
    }
    this.render();
  }

  render() {
    if (!this.boardElement) return;
    
    this.boardElement.innerHTML = '';
    this.boardElement.className = 'chess-board-14x14';

    for (let rank = 0; rank < 14; rank++) {
      for (let file = 0; file < 14; file++) {
        const square = document.createElement('div');
        square.className = 'chess-square';
        square.dataset.rank = rank;
        square.dataset.file = file;
        square.id = `square-${rank}-${file}`;

        const piece = this.game.getPiece(rank, file);
        if (piece) {
          const pieceEl = document.createElement('div');
          pieceEl.className = `piece piece-${this.getPlayerInitial(piece.player)}${piece.type}`;
          pieceEl.dataset.piece = piece.type;
          pieceEl.dataset.player = piece.player;
          square.appendChild(pieceEl);
        }

        this.boardElement.appendChild(square);
      }
    }
  }

  getPlayerInitial(playerIndex) {
    const initials = { 0: 'r', 1: 'b', 2: 'y', 3: 'g' };
    return initials[playerIndex] || '';
  }

  getSquareAtEvent(event) {
    const square = event.target.closest('[data-rank][data-file]');
    if (square) {
      const rank = parseInt(square.dataset.rank);
      const file = parseInt(square.dataset.file);
      return [rank, file];
    }
    return null;
  }

  selectSquare(rank, file) {
    if (this.selectedSquare) {
      const prev = this.boardElement.querySelector(`[data-rank="${this.selectedSquare[0]}"][data-file="${this.selectedSquare[1]}"]`);
      if (prev) prev.classList.remove('selected');
    }

    this.selectedSquare = [rank, file];
    const square = this.boardElement.querySelector(`[data-rank="${rank}"][data-file="${file}"]`);
    if (square) square.classList.add('selected');
  }

  highlightMoves(moves) {
    this.validMoves.forEach(m => {
      const sq = this.boardElement.querySelector(`[data-rank="${m[0]}"][data-file="${m[1]}"]`);
      if (sq) sq.classList.remove('valid-move');
    });

    this.validMoves = moves;
    moves.forEach(([rank, file]) => {
      const sq = this.boardElement.querySelector(`[data-rank="${rank}"][data-file="${file}"]`);
      if (sq) sq.classList.add('valid-move');
    });
  }

  clearSelection() {
    if (this.selectedSquare) {
      const sq = this.boardElement.querySelector(`[data-rank="${this.selectedSquare[0]}"][data-file="${this.selectedSquare[1]}"]`);
      if (sq) sq.classList.remove('selected');
      this.selectedSquare = null;
    }
    this.highlightMoves([]);
  }
}
