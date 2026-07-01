import { describe, it, expect } from "vitest";
import { formatAnalysisRange, themeLabel } from "../api/client.js";

describe("formatAnalysisRange", () => {
  it("returns null when meta is empty", () => {
    expect(formatAnalysisRange({})).toBeNull();
    expect(formatAnalysisRange(null)).toBeNull();
    expect(formatAnalysisRange(undefined)).toBeNull();
  });

  it("returns single date when earliest equals latest", () => {
    const result = formatAnalysisRange({
      earliest_game: "2024-01-15T00:00:00Z",
      latest_game: "2024-01-15T00:00:00Z",
    });
    expect(result).toBeTruthy();
    expect(result).not.toContain("–");
  });

  it("returns range string with en-dash when dates differ", () => {
    const result = formatAnalysisRange({
      earliest_game: "2023-02-01T00:00:00Z",
      latest_game: "2026-06-30T00:00:00Z",
    });
    expect(result).toContain("–");
    expect(result.split("–").length).toBe(2);
  });

  it("returns start only when latest_game is missing", () => {
    const result = formatAnalysisRange({ earliest_game: "2024-03-01T00:00:00Z" });
    expect(result).toBeTruthy();
    expect(result).not.toContain("–");
  });

  it("returns null for invalid date strings", () => {
    expect(formatAnalysisRange({ earliest_game: "not-a-date" })).toBeNull();
  });
});

describe("themeLabel", () => {
  it("maps known themes to display labels", () => {
    expect(themeLabel("missed_fork")).toBe("Missed fork");
    expect(themeLabel("missed_pin")).toBe("Missed pin");
    expect(themeLabel("king_safety")).toBe("King safety");
    expect(themeLabel("missed_back_rank")).toBe("Back rank");
  });

  it("converts unknown themes from snake_case to words", () => {
    expect(themeLabel("some_new_theme")).toBe("some new theme");
  });
});
