import { describe, it, expect } from "vitest";
import { uciToSan, sideToMove } from "../notation.js";

// White to move; knight on d4.
const KNIGHT_FEN = "1rb1k2r/2qnb1p1/p2p2p1/1p6/3N4/2N2Q2/PPP4P/2KR1B1R w k - 0 17";
// Black to move.
const BLACK_FEN = "r1b2rk1/pp3ppp/5n2/2p1q3/5P2/P1PBP3/6PP/R1BQ1RK1 b - - 0 14";

describe("uciToSan", () => {
  it("renders piece moves in SAN", () => {
    expect(uciToSan(KNIGHT_FEN, "d4b3")).toBe("Nb3");
    expect(uciToSan(KNIGHT_FEN, "d4e6")).toBe("Ne6");
  });

  it("marks captures", () => {
    expect(uciToSan(KNIGHT_FEN, "d4b5")).toContain("x");
  });

  it("handles promotion", () => {
    expect(uciToSan("8/P6k/8/8/8/8/8/K7 w - - 0 1", "a7a8q")).toBe("a8=Q");
  });

  it("works for black to move", () => {
    expect(uciToSan(BLACK_FEN, "e5d5")).toBe("Qd5");
  });

  it("falls back to raw UCI on an illegal move", () => {
    expect(uciToSan(KNIGHT_FEN, "a1a8")).toBe("a1a8");
  });

  it("falls back on garbage input", () => {
    expect(uciToSan(KNIGHT_FEN, "zzzz")).toBe("zzzz");
  });

  it("returns the UCI when there is no FEN", () => {
    expect(uciToSan(null, "d4b3")).toBe("d4b3");
  });

  it("returns an em dash for a missing move", () => {
    expect(uciToSan(KNIGHT_FEN, null)).toBe("—");
  });
});

describe("sideToMove", () => {
  it("reads the side to move from the FEN", () => {
    expect(sideToMove(KNIGHT_FEN)).toBe("white");
    expect(sideToMove(BLACK_FEN)).toBe("black");
  });

  it("defaults to white on a bad FEN", () => {
    expect(sideToMove("nonsense")).toBe("white");
  });
});
