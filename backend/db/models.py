from sqlalchemy import Column, String, Integer, Float, Boolean, JSON, DateTime, ForeignKey
from sqlalchemy.orm import declarative_base, relationship
Base = declarative_base()

class Game(Base):
    __tablename__ = "games"
    id = Column(String, primary_key=True)          # Chess.com game ID
    username = Column(String, nullable=False)
    player_color = Column(String)                   # "white" | "black"
    result = Column(String)                         # "win" | "loss" | "draw"
    time_control = Column(String)
    eco = Column(String)
    opening_name = Column(String)
    played_at = Column(DateTime)
    raw_pgn = Column(String)
    analyzed = Column(Boolean, default=False)       # Has Stockfish run on this?
    positions = relationship("Position", back_populates="game")

class Position(Base):
    __tablename__ = "positions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    game_id = Column(String, ForeignKey("games.id"))
    fen = Column(String, nullable=False, index=True)  # Indexed — you'll query by FEN often
    move_number = Column(Integer)
    move_played = Column(String)                    # UCI format e.g. "e2e4"
    best_move = Column(String)                      # From Stockfish
    centipawn_loss = Column(Float)                  # How bad was your move?
    classification = Column(String)                 # "blunder" | "mistake" | "inaccuracy" | "good"
    clock_remaining = Column(Float)                 # Seconds left on clock
    is_your_move = Column(Boolean)
    tactical_motif = Column(String)                 # e.g. "missed_fork", "missed_skewer" — classifier
    embedding = Column(JSON)                        # FEN vector, stored as list
    game = relationship("Game", back_populates="positions")

class WeaknessProfile(Base):
    __tablename__ = "weakness_profiles"
    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, nullable=False)
    theme = Column(String)                          # e.g. "fork_blindspot", "time_pressure_endgame"
    frequency = Column(Integer, default=0)          # How often this comes up
    severity = Column(Float, default=0.0)           # Avg centipawn loss in this theme
    last_seen = Column(DateTime)
    centroid = Column(JSON)                         # Cluster centroid vector
    updated_at = Column(DateTime)

class GmProfile(Base):
    """Precomputed style fingerprint for a grandmaster, derived from their game corpus."""
    __tablename__ = "gm_profiles"
    slug         = Column(String, primary_key=True)   # "morphy", "tal", etc.
    display_name = Column(String, nullable=False)
    birth_year   = Column(Integer)
    # 0–100 style axes
    development    = Column(Float, default=0.0)
    open_files     = Column(Float, default=0.0)
    king_attack    = Column(Float, default=0.0)
    sacrifice_rate = Column(Float, default=0.0)
    aggression     = Column(Float, default=0.0)
    # Human-readable stats for the comparison table
    avg_game_length      = Column(Float)
    sacrifice_rate_pct   = Column(String)
    open_file_pct        = Column(String)
    king_attack_pct      = Column(String)
    development_speed    = Column(String)   # e.g. "move 5.1"
    games_analyzed = Column(Integer, default=0)
    updated_at     = Column(DateTime)


class CoachingSession(Base):
    __tablename__ = "coaching_sessions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String)
    created_at = Column(DateTime)
    report = Column(String)                         # Full coaching report text
    games_analyzed = Column(JSON)                   # List of game IDs included


class IngestJob(Base):
    __tablename__ = "ingest_jobs"
    id = Column(String, primary_key=True)
    username = Column(String, nullable=False)
    status = Column(String, nullable=False, default="pending")
    games_ingested = Column(Integer, default=0)
    games_analyzed = Column(Integer, default=0)
    games_total = Column(Integer, default=0)
    weakness_themes = Column(Integer, default=0)
    error = Column(String)
    created_at = Column(DateTime)
    updated_at = Column(DateTime)
