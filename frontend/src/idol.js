// Your "idol" — the grandmaster you're training to play like. Persisted per
// user in localStorage so it drives the Style tab, the dashboard hero card, and
// (later) the coach's voice. This is the personal north star of the product.

const KEY = (username) => `morphy_idol_${username}`;

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function storageSet(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* private mode / sandboxed — ignore */
  }
}

// The demo showcases the feature to recruiters, so give it a populated default.
// The demo player reads closest to Tal, so default the idol to Carlsen — the
// biggest gap — to demonstrate a real "you play like X, training toward Y"
// journey with a meaningful habit rather than idol == closest.
export function getIdol(username) {
  const saved = storageGet(KEY(username));
  if (saved) return saved;
  return username === "demo" ? "carlsen" : null;
}

export function setIdol(username, slug) {
  storageSet(KEY(username), slug);
}

// The five style axes, with a concrete, direction-aware habit for closing the
// gap toward your idol. `below` = you score lower than the idol on this axis.
export const AXIS_META = {
  decisiveness: {
    label: "Decisiveness",
    below: (gm) => `Play for the win more — keep tension on the board instead of settling for draws like ${gm} avoids.`,
    above: (gm) => `You force decisions more than ${gm}; sometimes accepting a draw is the stronger call.`,
  },
  endgame_tendency: {
    label: "Endgames",
    below: (gm) => `Steer more games into endgames rather than forcing matters early — that's where ${gm} does damage.`,
    above: (gm) => `You reach endgames often; try building middlegame pressure the way ${gm} does.`,
  },
  patience: {
    label: "Patience",
    below: (gm) => `Slow down — ${gm} grinds long games. Look for a second plan before forcing the issue.`,
    above: (gm) => `You play long games; ${gm} converts faster — hunt for the decisive break sooner.`,
  },
  simplification: {
    label: "Simplifying",
    below: (gm) => `When ahead, trade down into clean, technical positions like ${gm} does.`,
    above: (gm) => `You simplify a lot; ${gm} keeps pieces on to attack — try holding the tension.`,
  },
  attack: {
    label: "Attack",
    below: (gm) => `Look for a forcing check or capture before every quiet move — that's the heart of ${gm}'s game.`,
    above: (gm) => `You attack more than ${gm}; pick your moments — not every position wants a sacrifice.`,
  },
};

// Flavor for the "which legend are you?" reveal — an epithet + one-line
// character read per GM. Kept punchy and directional (matching the model's
// fidelity), not a scholarly bio.
export const LEGEND_PERSONA = {
  morphy: {
    epithet: "The Pride and Sorrow of Chess",
    tagline: "Swift, elegant, decisive — punishes every loose move.",
  },
  tal: {
    epithet: "The Magician of Riga",
    tagline: "Sacrifice first, calculate later. Chaos is a ladder.",
  },
  fischer: {
    epithet: "The American Legend",
    tagline: "Surgical precision and a relentless will to win.",
  },
  kasparov: {
    epithet: "The Beast of Baku",
    tagline: "Dynamic aggression backed by ruthless preparation.",
  },
  carlsen: {
    epithet: "The Grinder",
    tagline: "Squeezes water from stone — endless endgame pressure.",
  },
};

export function persona(slug) {
  return LEGEND_PERSONA[slug] ?? { epithet: "", tagline: "" };
}

export const AXIS_KEYS = ["decisiveness", "endgame_tendency", "patience", "simplification", "attack"];

// Given your axes and your idol's, find the single biggest gap and the habit to
// close it. Returns null if data is missing.
export function biggestGap(youAxes, gmAxes, gmName) {
  if (!youAxes || !gmAxes) return null;
  let top = null;
  for (const key of AXIS_KEYS) {
    const diff = (gmAxes[key] ?? 0) - (youAxes[key] ?? 0);
    if (top === null || Math.abs(diff) > Math.abs(top.diff)) {
      top = { key, diff };
    }
  }
  if (!top) return null;
  const meta = AXIS_META[top.key];
  return {
    key: top.key,
    label: meta.label,
    // diff > 0 means the idol scores higher → you're "below" them on this axis.
    habit: top.diff >= 0 ? meta.below(gmName) : meta.above(gmName),
  };
}
