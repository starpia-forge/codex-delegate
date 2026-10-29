// Keep these CSS-pixel sizes in sync with index.html. Pet width includes
// the tag's padding. Reserve a worker badge per pet (each could be a team),
// the larger inter-team gap, and one trailing sessions badge plus its gap.
const CELL_WIDTH = 192, TAG_SPACE = 24, TEAM_GAP = 16, PET_GAP = 4;
const SIDE_PADDING = 8, WORKER_BADGE = 48, SESSIONS_BADGE = 96;

// Leave one pixel for rounding in DOM offsets and widths.
export function exitTarget({ home, homeLeft, petWidth, scale }) {
  return home - (homeLeft + petWidth + 1) / (CELL_WIDTH * scale + TAG_SPACE + PET_GAP);
}

// Pixel translation from the untransformed flex slot, including exits.
export function sceneOffset({ x, home }, { scale }) {
  const slotWidth = CELL_WIDTH * scale + TAG_SPACE + PET_GAP;
  return (x - home) * slotWidth;
}

export function fitLimit({ width, scale }) {
  const perTeam = CELL_WIDTH * scale + TAG_SPACE + PET_GAP + WORKER_BADGE + TEAM_GAP;
  return Math.max(0, Math.min(16, Math.floor((width - 2 * SIDE_PADDING - SESSIONS_BADGE) / perTeam)));
}

// Snapshot projection only: overflow never removes pets from the stage state.
export function applyOverflow(teams, limit, workerAppearance) {
  const leaders = teams.filter(team => team.leader);
  const visibleLeaders = new Set(leaders.slice(0, limit));
  const candidates = teams.filter(team => !team.leader || visibleLeaders.has(team));
  const visibleWorkers = new Set(candidates.flatMap(team => team.workers)
    .sort((a, b) => workerAppearance.get(a.worker) - workerAppearance.get(b.worker))
    .slice(0, Math.max(0, limit - visibleLeaders.size)));
  let overflowSessions = leaders.length - visibleLeaders.size;
  const visibleTeams = candidates.map(team => {
    const workers = team.workers.filter(worker => visibleWorkers.has(worker));
    return { ...team, workers, overflowWorkers: team.workers.length - workers.length };
  }).filter(team => {
    if (team.leader || team.workers.length) return true;
    // A leaderless team entirely in overflow shares the sessions badge, so badge
    // count remains bounded by visible pets even with many orphan workers.
    overflowSessions++;
    return false;
  });
  return { teams: visibleTeams, overflowSessions };
}
