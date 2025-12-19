# 4-Player Chess - Quick Start Guide

## What Was Implemented

### ✅ Game Logic (FourPlayerChess.js)
- Full 14×14 board management
- All piece types with correct movement rules
- Turn management for 4 players (Blue → Yellow → Red → Green)
- Automatic player elimination
- Scoring system with point values
- Check, checkmate, and stalemate detection
- Pawn promotion support

### ✅ Board Rendering (BoardRenderer.js)
- Visual 14×14 grid
- Color-coded pieces for each player (Blue, Yellow, Red, Green)
- Legal move highlighting
- Selected square highlighting
- Last move highlighting
- Check indicator on king

### ✅ User Interaction (MoveHandler.js + GameController.js)
- Click-to-select piece movement
- Drag-and-drop support
- Legal move validation
- Pawn promotion dialog
- Resignation handling
- Game status display
- Score tracking

## How to Use

### Start a Game

```javascript
import { initializeChessGame } from './client/src/chess/init.js';

const gameController = initializeChessGame();
```

### Make a Move

**Click Selection:**
1. Click a piece to select it
2. Legal move squares highlight
3. Click destination to move

**Drag and Drop:**
1. Drag a piece to a destination square
2. Drop to move (if legal)

### Promote a Pawn

When a pawn reaches the final rank:
1. Promotion dialog appears
2. Select Queen, Rook, Bishop, or Knight
3. Promotion executes automatically

### Check Game Status

```javascript
const status = gameController.game.getGameStatus();
console.log(status.message); // "Turn: blue", "Blue is in check!", etc.
console.log(status.scores); // {0: 15, 1: 0, 2: 8, 3: 5}
```

### Get Available Moves

```javascript
const moves = gameController.game.getAvailableMoves(PLAYERS.BLUE);
moves.forEach(m => console.log(m.from, '->', m.to));
```

## Board Layout

```
      a  b  c  d  e  f  g  h  i  j  k  l  m  n
    +--+--+--+--+--+--+--+--+--+--+--+--+--+--+
14  |  |  |  |  |  |  |  |  |  |  |  |  |  |  | RED PIECES
13  |r |r |r |r |r |r |r |r |r |r |r |r |r |r |
    +--+--+--+--+--+--+--+--+--+--+--+--+--+--+
12  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
11  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
10  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
 9  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
 8  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
 7  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
 6  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
 5  |  |  |  |  |  |  |  |  |  |  |  |  |  |  |
 4  |g |  |  |  |  |  |  |  |  |  |  |  |y |  | GREEN/YELLOW
 3  |g |  |  |  |  |  |  |  |  |  |  |  |y |  | PIECES
 2  |b |b |b |b |b |b |b |b |b |b |b |b |b |b | BLUE PAWNS
 1  |b |b |b |b |b |b |b |b |b |b |b |b |b |b | BLUE PIECES
    +--+--+--+--+--+--+--+--+--+--+--+--+--+--+

Legend: b=blue, y=yellow, r=red, g=green
```

## Player Information

| Player | Color  | Start Rank | Pawn Direction | Piece Type |
|--------|--------|-----------|--------|-------------|
| Blue   | 🔵     | 0-1       | Up ↑   | White chess pieces with blue tint |
| Yellow | 🟡     | 0-13 (Left) | Right → | White chess pieces with yellow tint |
| Red    | 🔴     | 12-13     | Down ↓ | White chess pieces with red tint |
| Green  | 🟢     | 0-13 (Right) | Left ← | White chess pieces with green tint |

## Scoring Example

```
Blue captures Yellow pawn (+1)
Yellow captures Blue bishop (+5)
Red captures Green rook (+5)
Red checkmates Green (+20)
Green is eliminated

Turn: Blue
Scores: Blue=6, Yellow=5, Red=30, Green=0 (eliminated)
```

## UI Elements

### Board
- ID: `chess-board`
- 14×14 grid with clickable squares
- Pieces rendered as divs with background images

### Status Display
- ID: `chess-status`
- Shows current turn, check status, game over message

### Player Display
- Blue: `chess-blue-name`, `chess-blue-timer`
- Yellow: `chess-yellow-name`, `chess-yellow-timer`
- Red: `chess-red-name`, `chess-red-timer`
- Green: `chess-green-name`, `chess-green-timer`

### Buttons
- `chess-confirm-move` - Confirm a tentative move (if premove enabled)
- `chess-resign` - Resign from game
- `chess-close` - Close game modal
- `promotion-overlay` - Pawn promotion dialog

## Game Rules Summary

### Objective
Be the last player standing. Players are eliminated through checkmate, stalemate, or resignation.

### Turn Order
Blue → Yellow → Red → Green → Blue... (eliminated players skipped)

### Piece Movement
- **Pawn**: 1 square forward, capture diagonally forward
- **Knight**: L-shape movement (2+1 squares)
- **Bishop**: Diagonal movement unlimited distance
- **Rook**: Horizontal/vertical movement unlimited distance
- **Queen**: Rook + Bishop combined
- **King**: 1 square in any direction

### Special Cases
- **Promotion**: Pawn reaching opposite end becomes Queen (or selected piece)
- **Check**: King is under attack (must move out of check)
- **Checkmate**: King in check with no legal moves (player eliminated)
- **Stalemate**: No legal moves but not in check (player eliminated)

### Scoring
- Capture Pawn: 1 point
- Capture Knight/Bishop/Rook: 3-5 points
- Capture Queen: 9 points
- Checkmate: 20 points
- Stalemate (per active player): 10 points

## Keyboard Shortcuts (Future)

- `U` - Undo move
- `R` - Resign
- `N` - New game
- `Escape` - Close game

## Troubleshooting

### Board not showing
- Check if `chess-board` element exists
- Verify CSS is loaded
- Check browser console for errors

### Pieces not rendering
- Verify piece CSS classes (`.piece-bk`, `.piece-yq`, etc.)
- Check if images from chessboardjs.com are accessible

### Moves not working
- Ensure you're moving a piece of the current player
- Click selected square again to deselect
- Check if move is legal (see highlighted squares)

### Game not starting
- Check if GameController initialized successfully
- Verify chess modal is visible
- Check browser console for JavaScript errors

## File Structure

```
client/src/chess/
├── FourPlayerChess.js      # Game logic
├── BoardRenderer.js        # Visual rendering
├── MoveHandler.js          # Move handling
├── GameController.js       # Main integration
├── init.js                 # Initialization
└── index.js                # Module exports

index.html                  # UI with board element
CHESS_IMPLEMENTATION.md     # Full documentation
CHESS_QUICK_START.md        # This file
```

## Next Steps

1. **Test the game**: Click pieces and move them around
2. **Try promotion**: Move a pawn to the opposite end
3. **Check game status**: Look at the status display
4. **Review code**: Check implementation details in docs

## Support

For issues or questions:
1. Check the browser console for errors
2. Review `CHESS_IMPLEMENTATION.md` for detailed documentation
3. Check individual class documentation in source files
