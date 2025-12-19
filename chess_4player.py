# -*- coding: utf-8 -*-
"""
4-Player Chess Implementation
Supports 4 independent players on an 8x8 board
Each player controls pieces from their corner: white (bottom), black (top), red (left), green (right)
"""

import chess
from enum import Enum

class PlayerColor(Enum):
    WHITE = 0
    BLACK = 1
    RED = 2
    GREEN = 3

class ChessBoard4Player:
    """
    Represents a 4-player chess board.
    - 8x8 board
    - White pieces at rank 0-1 (bottom) on files a-h
    - Black pieces at rank 6-7 (top) on files a-h
    - Red pieces at rank 0-1 (left) on files a-b
    - Green pieces at rank 6-7 (right) on files g-h
    
    Turn order: White -> Red -> Black -> Green -> White
    """
    
    def __init__(self):
        # Use standard chess board as base
        self.board = chess.Board()
        # Clear the standard board first
        self.board.clear()

        # Track piece ownership: piece_id -> player_color
        # Piece_id is created from position hash to track pieces through moves
        self.piece_ownership = {}  # (from_square) -> PlayerColor on initial setup
        self.initial_pieces = {}  # (square) -> (piece_type, player_color) for checking ownership

        # Setup pieces for each player
        self._setup_initial_position()

        # Track game state
        self.turn_index = 0  # 0=white, 1=red, 2=black, 3=green
        self.player_order = [PlayerColor.WHITE, PlayerColor.RED, PlayerColor.BLACK, PlayerColor.GREEN]
        self.eliminated_players = set()
        self.move_history = []
    
    def _setup_initial_position(self):
        """Set up initial piece positions for all 4 players"""
        # White (bottom-left, pieces on rank 0-1, files a-d)
        squares_white = [chess.A1, chess.B1, chess.C1, chess.D1]
        pieces_white = [chess.ROOK, chess.KNIGHT, chess.BISHOP, chess.QUEEN]
        for sq, piece_type in zip(squares_white, pieces_white):
            self.board.set_piece_at(sq, chess.Piece(piece_type, chess.WHITE))
            self.initial_pieces[sq] = (piece_type, PlayerColor.WHITE)
        for file_idx in range(4):  # a-d
            sq = chess.Square(file_idx, 1)
            self.board.set_piece_at(sq, chess.Piece(chess.PAWN, chess.WHITE))
            self.initial_pieces[sq] = (chess.PAWN, PlayerColor.WHITE)

        # Red (left-bottom, pieces on rank 0-1, files a-b, rotated orientation)
        squares_red = [chess.A2, chess.A3, chess.B2, chess.B3]
        pieces_red = [chess.ROOK, chess.KNIGHT, chess.BISHOP, chess.QUEEN]
        for sq, piece_type in zip(squares_red, pieces_red):
            self.board.set_piece_at(sq, chess.Piece(piece_type, chess.BLACK))
            self.initial_pieces[sq] = (piece_type, PlayerColor.RED)
        for rank_idx in range(2, 6):
            sq = chess.Square(0, rank_idx)
            self.board.set_piece_at(sq, chess.Piece(chess.PAWN, chess.BLACK))
            self.initial_pieces[sq] = (chess.PAWN, PlayerColor.RED)

        # Black (top-right, pieces on rank 6-7, files e-h)
        squares_black = [chess.E8, chess.F8, chess.G8, chess.H8]
        pieces_black = [chess.QUEEN, chess.BISHOP, chess.KNIGHT, chess.ROOK]
        for sq, piece_type in zip(squares_black, pieces_black):
            self.board.set_piece_at(sq, chess.Piece(piece_type, chess.BLACK))
            self.initial_pieces[sq] = (piece_type, PlayerColor.BLACK)
        for file_idx in range(4, 8):  # e-h
            sq = chess.Square(file_idx, 6)
            self.board.set_piece_at(sq, chess.Piece(chess.PAWN, chess.BLACK))
            self.initial_pieces[sq] = (chess.PAWN, PlayerColor.BLACK)

        # Green (right-top, pieces on rank 6-7, files g-h, rotated orientation)
        squares_green = [chess.G7, chess.H7, chess.G6, chess.H6]
        pieces_green = [chess.QUEEN, chess.BISHOP, chess.KNIGHT, chess.ROOK]
        for sq, piece_type in zip(squares_green, pieces_green):
            self.board.set_piece_at(sq, chess.Piece(piece_type, chess.WHITE))
            self.initial_pieces[sq] = (piece_type, PlayerColor.GREEN)
        for rank_idx in range(2, 6):
            sq = chess.Square(7, rank_idx)
            self.board.set_piece_at(sq, chess.Piece(chess.PAWN, chess.WHITE))
            self.initial_pieces[sq] = (chess.PAWN, PlayerColor.GREEN)
    
    def current_player(self):
        """Get the current player"""
        if self.turn_index < len(self.player_order):
            return self.player_order[self.turn_index % 4]
        return self.player_order[0]
    
    def current_player_color(self):
        """Get chess color for current player (white or black pieces)"""
        player = self.current_player()
        if player in [PlayerColor.WHITE, PlayerColor.GREEN]:
            return chess.WHITE
        else:
            return chess.BLACK
    
    def get_color_name(self, player_color):
        """Get readable name for a player"""
        return {
            PlayerColor.WHITE: 'white',
            PlayerColor.RED: 'red',
            PlayerColor.BLACK: 'black',
            PlayerColor.GREEN: 'green'
        }.get(player_color, 'unknown')
    
    def is_player_in_check(self, player_color):
        """Check if a specific player is in check"""
        piece_color = chess.WHITE if player_color in [PlayerColor.WHITE, PlayerColor.GREEN] else chess.BLACK
        
        # Find king of this player's pieces
        king_square = None
        for square in chess.SQUARES:
            piece = self.board.piece_at(square)
            if piece and piece.piece_type == chess.KING and piece.color == piece_color:
                # Additional validation: check if this is the correct player's king
                if self._square_belongs_to_player(square, player_color):
                    king_square = square
                    break
        
        if king_square is None:
            return False
        
        return self.board.is_attacked_by(not piece_color, king_square)
    
    def _square_belongs_to_player(self, square, player_color):
        """Determine if a square is in a player's home territory"""
        file, rank = square % 8, square // 8
        
        if player_color == PlayerColor.WHITE:
            return rank <= 1 and file <= 3
        elif player_color == PlayerColor.RED:
            return rank >= 0 and rank <= 3 and file <= 1
        elif player_color == PlayerColor.BLACK:
            return rank >= 6 and file >= 4
        elif player_color == PlayerColor.GREEN:
            return rank >= 4 and rank <= 7 and file >= 6
        
        return False
    
    def is_player_checkmated(self, player_color):
        """Check if a specific player is checkmated"""
        piece_color = chess.WHITE if player_color in [PlayerColor.WHITE, PlayerColor.GREEN] else chess.BLACK
        
        if not self.is_player_in_check(player_color):
            return False
        
        # Check if player has any legal moves
        for move in self.board.legal_moves:
            piece = self.board.piece_at(move.from_square)
            if piece and piece.color == piece_color:
                if self._is_move_by_player(move, player_color):
                    return False
        
        return True
    
    def _is_move_by_player(self, move, player_color):
        """Check if a move belongs to a specific player"""
        from_square = move.from_square
        piece = self.board.piece_at(from_square)
        
        if not piece:
            return False
        
        expected_color = chess.WHITE if player_color in [PlayerColor.WHITE, PlayerColor.GREEN] else chess.BLACK
        
        if piece.color != expected_color:
            return False
        
        # Additional validation based on initial position
        return self._square_belongs_to_player(from_square, player_color)
    
    def is_move_legal(self, from_square, to_square, player_color):
        """Check if a move is legal for the current player"""
        try:
            move = chess.Move(from_square, to_square)
            
            # Check if move is in legal moves
            if move not in self.board.legal_moves:
                return False
            
            # Check if move belongs to current player
            if self.current_player() != player_color:
                return False
            
            # Check if piece belongs to player
            if not self._is_move_by_player(move, player_color):
                return False
            
            return True
        except:
            return False
    
    def make_move(self, from_square, to_square, promotion=None):
        """
        Make a move and return move details
        Returns: {'success': bool, 'move': Move object or None, 'message': str}
        """
        try:
            uci_move = chess.square_name(from_square) + chess.square_name(to_square)
            if promotion:
                uci_move += promotion.lower()
            
            move = chess.Move.from_uci(uci_move)
            
            if move not in self.board.legal_moves:
                return {'success': False, 'message': 'Illegal move'}
            
            # Validate move belongs to current player
            if not self._is_move_by_player(move, self.current_player()):
                return {'success': False, 'message': 'Not your pieces'}
            
            # Make the move
            self.board.push(move)
            self.move_history.append({
                'from': chess.square_name(from_square),
                'to': chess.square_name(to_square),
                'promotion': promotion,
                'player': self.get_color_name(self.current_player()),
                'fen': self.board.fen()
            })
            
            # Check for checkmate or elimination
            eliminated = False
            for player in self.player_order:
                if player not in self.eliminated_players and self.is_player_checkmated(player):
                    self.eliminated_players.add(player)
                    eliminated = True
            
            # Move to next player
            self.advance_turn()
            
            return {
                'success': True,
                'move': move,
                'eliminated': eliminated,
                'current_player': self.get_color_name(self.current_player()),
                'fen': self.board.fen()
            }
        except Exception as e:
            return {'success': False, 'message': str(e)}
    
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
    
    def fen(self):
        """Get FEN representation"""
        return self.board.fen()
    
    def get_game_state(self):
        """Get complete game state"""
        return {
            'fen': self.board.fen(),
            'turn': self.get_color_name(self.current_player()),
            'turn_index': self.turn_index,
            'eliminated': [self.get_color_name(p) for p in self.eliminated_players],
            'is_over': self.is_game_over(),
            'winner': self.get_winner(),
            'move_history': self.move_history
        }
