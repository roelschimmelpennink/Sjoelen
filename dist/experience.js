import { clamp } from './physics.js';

export const HOLD_THRESHOLD_MS = 180;
export const CHARGE_DURATION_MS = 1600;

// A tap honours the slider. A deliberate hold charges from gentle to full power.
export function powerForHold(milliseconds, preset) {
  if (milliseconds < HOLD_THRESHOLD_MS) return clamp(preset, 5, 100);
  return Math.round(5 + 95 * clamp((milliseconds - HOLD_THRESHOLD_MS) / CHARGE_DURATION_MS, 0, 1));
}

// Record only the causal chain starting at the disc currently followed.
export function recordReplayImpact(timeline, impact, time) {
  if(impact.sourceId===timeline[timeline.length-1].id&&impact.targetId!==impact.sourceId)timeline.push({t:time,id:impact.targetId});
}

// Time-based lookup also works when seeking backwards or changing playback speed.
export function replayFocusAt(timeline, time) {
  let lo=0,hi=timeline.length-1;
  while(lo<hi){const mid=Math.floor((lo+hi+1)/2);if(timeline[mid].t<=time)lo=mid;else hi=mid-1;}
  return timeline[lo].id;
}

const smooth = (a, b, value) => { const t = clamp((value - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

// Camera composition stays independent of playback speed and frame rate.
export function cinematicPose(puck, progress, aspect = 1.4) {
  const push = smooth(0, 0.4, progress), reveal = smooth(0.82, 1, progress);
  const distance = (1.05 - 0.53 * push + 0.22 * reveal) * (aspect < 1 ? 1.22 : 1);
  const azimuth = 0.52 + Math.sin(progress * Math.PI) * 0.28;
  const elevation = 0.73 + reveal * 0.22;
  const speed = Math.hypot(puck.vx, puck.vz);
  const lookAhead = Math.min(0.045, speed * 0.022) * (1 - reveal);
  const target = { x: puck.x + (speed ? puck.vx / speed * lookAhead : 0), y: (puck.y||0)+0.012, z: puck.z + (speed ? puck.vz / speed * lookAhead : 0) };
  return {
    target,
    position: { x: target.x + Math.sin(azimuth) * Math.cos(elevation) * distance, y: target.y + Math.sin(elevation) * distance, z: target.z + Math.cos(azimuth) * Math.cos(elevation) * distance },
    fov: 40 - 6 * push + 3 * reveal
  };
}
