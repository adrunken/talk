# -*- coding: utf-8 -*-
"""
4-Player Chess Implementation - 14x14 Board
Supports 4 independent players on a 14x14 board
Each player controls pieces from their corner:
- Blue (bottom): ranks 1-2, files a-n
- Red (top): ranks 13-14, files a-n
- Yellow (left): files a-b, ranks 1-14
- Green (right): files m-n, ranks 1-14
"""

from enum import Enum

class PlayerColor(Enum):
    BLUE = 0
    YELLOW = 1
    RED = 2
    GREEN = 3

class Piece:
    """Represents a chess piece"""
    PAWN = 'p'
    KNIGHT = 'n'
    BISHOP = 'b'
    ROOK = 'r'
    QUEEN = 'q'
    KING = 'k'
    
    def __init__(self, piece_type, player):
        self.type = piece_type
        self.player = player
    
    def __repr__(self):
        return f"Piece({self.type}, {self.player.name})"

class ChessBoard4Player:
    """
    Represents a 14x14 4-player chess board.
    
    Board Layout:
    - Files: a-n (0-13)
    - Ranks: 1-14 (0-13, where 0=rank1, 13=rank14)
    
    Player Positions:
    - BLUE: ranks 1-2, files a-n (bottom)
    - YELLOW: files a-b, ranks 1-14 (left)
    - RED: ranks 13-14, files a-n (top)
    - GREEN: files m-n, ranks 1-14 (right)
    """
    
    def __init__(self):
        # 14x14 board representation [rank][file]
        self.board = [[None for _ in range(14)] for _ in range(14)]
        
        # Track piece ownership
        self.piece_owners = {}  # (rank, file) -> PlayerColor
        
        # Game state
        self.turn_index = 0  # 0=blue, 1=yellow, 2=red, 3=green
        self.player_order = [PlayerColor.BLUE, PlayerColor.YELLOW, PlayerColor.RED, PlayerColor.GREEN]
        self.eliminated_players = set()
        self.move_history = []
        
        # Setup initial position
        self._setup_initial_position()
    
    def _setup_initial_position(self):
        """Set up initial piece positions for all 4 players on 14x14 board"""
        
        # BLUE (bottom): ranks 1-2, files a-n
        # Rank 2: Blue's pawns
        for f in range(14):
            self._place_piece(1, f, Piece(Piece.PAWN, PlayerColor.BLUE))
        
        # Rank 1: Blue's back row
        blue_back = [Piece.ROOK, Piece.KNIGHT, Piece.BISHOP, Piece.QUEEN, Piece.KING,
                     Piece.BISHOP, Piece.KNIGHT, Piece.ROOK, Piece.ROOK, Piece.KNIGHT,
                     Piece.BISHOP, Piece.QUEEN, Piece.KING, Piece.BISHOP]
        for f in range(14):
            self._place_piece(0, f, Piece(blue_back[f], PlayerColor.BLUE))
        
        # YELLOW (left): files a-b, ranks 1-14
        # File a (rank order from bottom to top): pawns, back row
        yellow_pawns = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]  # ranks for pawns (skip 0,1,13)
        for r in yellow_pawns:
            self._place_piece(r, 0, Piece(Piece.PAWN, PlayerColor.YELLOW))
        
        # File b: Yellow's back row (at ranks 0, 1, 13, and more pieces)
        yellow_back_positions = [
            (0, Piece.ROOK), (1, Piece.KNIGHT), (13, Piece.BISHOP), 
            (12, Piece.QUEEN), (11, Piece.KING), (10, Piece.BISHOP),
            (9, Piece.KNIGHT), (8, Piece.ROOK), (7, Piece.ROOK), (6, Piece.KNIGHT),
            (5, Piece.BISHOP), (4, Piece.QUEEN), (3, Piece.KING), (2, Piece.BISHOP)
        ]
        for r, piece_type in yellow_back_positions:
            self._place_piece(r, 1, Piece(piece_type, PlayerColor.YELLOW))
        
        # RED (top): ranks 13-14, files a-n
        # Rank 13: Red's pawns (opposite of Blue)
        for f in range(14):
            self._place_piece(12, f, Piece(Piece.PAWN, PlayerColor.RED))
        
        # Rank 14: Red's back row (reversed, facing down)
        red_back = [Piece.ROOK, Piece.KNIGHT, Piece.BISHOP, Piece.QUEEN, Piece.KING,
                    Piece.BISHOP, Piece.KNIGHT, Piece.ROOK, Piece.ROOK, Piece.KNIGHT,
                    Piece.BISHOP, Piece.QUEEN, Piece.KING, Piece.BISHOP]
        for f in range(14):
            self._place_piece(13, f, Piece(red_back[13-f], PlayerColor.RED))  # Reversed
        
        # GREEN (right): files m-n, ranks 1-14
        # File n (rank order): pawns and back row
        green_pawns = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]  # ranks for pawns
        for r in green_pawns:
            self._place_piece(r, 13, Piece(Piece.PAWN, PlayerColor.GREEN))
        
        # File m: Green's back row (facing left)
        green_back_positions = [
            (0, Piece.ROOK), (1, Piece.KNIGHT), (13, Piece.BISHOP),
            (12, Piece.QUEEN), (11, Piece.KING), (10, Piece.BISHOP),
            (9, Piece.KNIGHT), (8, Piece.ROOK), (7, Piece.ROOK), (6, Piece.KNIGHT),
            (5, Piece.BISHOP), (4, Piece.QUEEN), (3, Piece.KING), (2, Piece.BISHOP)
        ]
        for r, piece_type in green_back_positions:
            self._place_piece(r, 12, Piece(piece_type, PlayerColor.GREEN))
    
    def _place_piece(self, rank, file, piece):
        """Place a piece on the board and track ownership"""
        if 0 <= rank < 14 and 0 <= file < 14:
            self.board[rank][file] = piece
            self.piece_owners[(rank, file)] = piece.player
    
    def _get_piece_at(self, rank, file):
        """Get piece at position"""
        if 0 <= rank < 14 and 0 <= file < 14:
            return self.board[rank][file]
        return None
    
    def _is_valid_position(self, rank, file):
        """Check if position is within board"""
        return 0 <= rank < 14 and 0 <= file < 14
    
    def _get_file_char(self, file):
        """Convert file index to character"""
        return chr(97 + file)  # a-n
    
    def _get_rank_num(self, rank):
        """Convert rank index to number"""
        return rank + 1  # 1-14
    
    def _notation_to_coords(self, notation):
        """Convert notation like 'a1' to (rank, file)"""
        if len(notation) < 2:
            return None
        file = ord(notation[0].lower()) - 97  # a-n = 0-13
        rank = int(notation[1:]) - 1  # 1-14 = 0-13
        if not self._is_valid_position(rank, file):
            return None
        return (rank, file)
    
    def _coords_to_notation(self, rank, file):
        """Convert (rank, file) to notation like 'a1'"""
        return self._get_file_char(file) + str(self._get_rank_num(rank))
    
    def current_player(self):
        """Get the current player"""
        return self.player_order[self.turn_index % 4]
    
    def get_color_name(self, player_color):
        """Get readable name for a player"""
        names = {
            PlayerColor.BLUE: 'blue',
            PlayerColor.YELLOW: 'yellow',
            PlayerColor.RED: 'red',
            PlayerColor.GREEN: 'green'
        }
        return names.get(player_color, 'unknown')
    
    def is_player_piece(self, piece, player_color):
        """Check if piece belongs to player"""
        return piece is not None and piece.player == player_color
    
    def _can_move_piece(self, from_rank, from_file, to_rank, to_file, player_color):
        """Check if a piece can move from one square to another"""
        piece = self._get_piece_at(from_rank, from_file)
        
        if not self.is_player_piece(piece, player_color):
            return False
        
        # Can't move to own piece
        target = self._get_piece_at(to_rank, to_file)
        if target and target.player == player_color:
            return False
        
        # Basic move validation by piece type
        rank_diff = abs(to_rank - from_rank)
        file_diff = abs(to_file - from_file)
        
        if piece.type == Piece.PAWN:
            return self._can_pawn_move(from_rank, from_file, to_rank, to_file, piece.player)
        elif piece.type == Piece.KNIGHT:
            return (rank_diff == 2 and file_diff == 1) or (rank_diff == 1 and file_diff == 2)
        elif piece.type == Piece.BISHOP:
            return rank_diff == file_diff and self._path_clear(from_rank, from_file, to_rank, to_file)
        elif piece.type == Piece.ROOK:
            return (rank_diff == 0 or file_diff == 0) and self._path_clear(from_rank, from_file, to_rank, to_file)
        elif piece.type == Piece.QUEEN:
            is_diagonal = rank_diff == file_diff
            is_straight = (rank_diff == 0 or file_diff == 0)
            return (is_diagonal or is_straight) and self._path_clear(from_rank, from_file, to_rank, to_file)
        elif piece.type == Piece.KING:
            return rank_diff <= 1 and file_diff <= 1 and (rank_diff + file_diff > 0)
        
        return False
    
    def _can_pawn_move(self, from_rank, from_file, to_rank, to_file, player_color):
        """Check if pawn can move"""
        rank_diff = to_rank - from_rank
        file_diff = abs(to_file - from_file)
        target = self._get_piece_at(to_rank, to_file)
        
        # Determine pawn direction based on player color
        if player_color == PlayerColor.BLUE:
            # Blue moves up (increasing rank)
            forward_direction = 1
        elif player_color == PlayerColor.RED:
            # Red moves down (decreasing rank)
            forward_direction = -1
        elif player_color == PlayerColor.YELLOW:
            # Yellow moves right (increasing file)
            return self._yellow_pawn_move(from_rank, from_file, to_rank, to_file)
        elif player_color == PlayerColor.GREEN:
            # Green moves left (decreasing file)
            return self._green_pawn_move(from_rank, from_file, to_rank, to_file)
        
        # Standard forward/capture for Blue and Red
        if file_diff == 0 and rank_diff == forward_direction and not target:
            return True  # One square forward
        if file_diff == 1 and rank_diff == forward_direction and target:
            return True  # Diagonal capture
        
        return False
    
    def _yellow_pawn_move(self, from_rank, from_file, to_rank, to_file, player_color=PlayerColor.YELLOW):
        """Check Yellow pawn moves (moving right, file increases)"""
        file_diff = to_file - from_file
        rank_diff = abs(to_rank - from_file)
        target = self._get_piece_at(to_rank, to_file)
        
        if rank_diff == 0 and file_diff == 1 and not target:
            return True  # One square forward
        if rank_diff == 1 and file_diff == 1 and target and target.player != player_color:
            return True  # Diagonal capture
        
        return False
    
    def _green_pawn_move(self, from_rank, from_file, to_rank, to_file, player_color=PlayerColor.GREEN):
        """Check Green pawn moves (moving left, file decreases)"""
        file_diff = from_file - to_file
        rank_diff = abs(to_rank - from_rank)
        target = self._get_piece_at(to_rank, to_file)
        
        if rank_diff == 0 and file_diff == 1 and not target:
            return True  # One square forward
        if rank_diff == 1 and file_diff == 1 and target and target.player != player_color:
            return True  # Diagonal capture
        
        return False
    
    def _path_clear(self, from_rank, from_file, to_rank, to_file):
        """Check if path between two squares is clear"""
        rank_step = 0 if from_rank == to_rank else (1 if to_rank > from_rank else -1)
        file_step = 0 if from_file == to_file else (1 if to_file > from_file else -1)
        
        r, f = from_rank + rank_step, from_file + file_step
        while (r, f) != (to_rank, to_file):
            if self._get_piece_at(r, f) is not None:
                return False
            r += rank_step
            f += file_step
        
        return True
    
    def make_move(self, from_notation, to_notation, promotion=None):
        """
        Make a move and return move details
        Returns: {'success': bool, 'move': str or None, 'message': str}
        """
        from_coords = self._notation_to_coords(from_notation)
        to_coords = self._notation_to_coords(to_notation)
        
        if not from_coords or not to_coords:
            return {'success': False, 'message': 'Invalid coordinates'}
        
        from_rank, from_file = from_coords
        to_rank, to_file = to_coords
        
        current_player = self.current_player()
        
        if not self._can_move_piece(from_rank, from_file, to_rank, to_file, current_player):
            return {'success': False, 'message': 'Illegal move'}
        
        piece = self._get_piece_at(from_rank, from_file)
        captured = self._get_piece_at(to_rank, to_file)
        
        # Make the move
        self.board[to_rank][to_file] = piece
        self.board[from_rank][from_file] = None
        
        self.piece_owners[(to_rank, to_file)] = current_player
        if (from_rank, from_file) in self.piece_owners:
            del self.piece_owners[(from_rank, from_file)]
        
        # Handle pawn promotion
        if piece.type == Piece.PAWN and promotion:
            piece.type = promotion.lower()
        
        # Record move
        self.move_history.append({
            'from': from_notation,
            'to': to_notation,
            'promotion': promotion,
            'player': self.get_color_name(current_player),
            'captured': captured is not None
        })
        
        # Check for captured king (player elimination)
        if captured and captured.type == Piece.KING:
            self.eliminated_players.add(captured.player)
        
        # Advance turn
        self.advance_turn()
        
        return {
            'success': True,
            'move': f"{from_notation}{to_notation}",
            'current_player': self.get_color_name(self.current_player()),
            'board_state': self.get_board_state()
        }
    
    def advance_turn(self):
        """Move to next player's turn, skipping eliminated players"""
        while True:
            self.turn_index = (self.turn_index + 1) % 4
            if self.current_player() not in self.eliminated_players:
                break
    
    def is_game_over(self):
        """Game is over when only one player remains"""
        return len(self.eliminated_players) >= 3
    
    def get_winner(self):
        """Get the winning player"""
        if not self.is_game_over():
            return None
        
        for player in self.player_order:
            if player not in self.eliminated_players:
                return self.get_color_name(player)
        
        return None
    
    def get_board_state(self):
        """Get FEN-like representation of board"""
        fen_rows = []
        for rank in range(13, -1, -1):  # Top to bottom
            row = ""
            empty_count = 0
            for file in range(14):
                piece = self._get_piece_at(rank, file)
                if piece:
                    if empty_count > 0:
                        row += str(empty_count)
                        empty_count = 0
                    piece_char = piece.type.upper() if piece.player in [PlayerColor.BLUE, PlayerColor.GREEN] else piece.type
                    row += piece_char
                else:
                    empty_count += 1
            if empty_count > 0:
                row += str(empty_count)
            fen_rows.append(row)
        
        return '/'.join(fen_rows)
    
    def get_game_state(self):
        """Get complete game state"""
        return {
            'board_state': self.get_board_state(),
            'turn': self.get_color_name(self.current_player()),
            'turn_index': self.turn_index,
            'eliminated': [self.get_color_name(p) for p in self.eliminated_players],
            'is_over': self.is_game_over(),
            'winner': self.get_winner(),
            'move_history': self.move_history,
            'board_size': 14
        }
