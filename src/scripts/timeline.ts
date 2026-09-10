import { state, subscribe, setWeekIndex, togglePlay, setPlaybackSpeed, getCurrentWeek, getWeekInterval } from './state';
import { formatDate, formatDateFromMs } from './utils';

const DAY_MS = 24 * 60 * 60 * 1000;

interface DateAnimation {
  startMs: number;
  endMs: number;
  startTime: number;
  duration: number;
}

let slider: HTMLInputElement;
let playBtn: HTMLButtonElement;
let playIcon: HTMLElement;
let dateDisplay: HTMLElement;
let weekCount: HTMLElement;
let speedBtn: HTMLButtonElement;
let animationFrame: number | null = null;
let lastFrameTime = 0;
let dateAnimation: DateAnimation | null = null;

export function initTimeline(): void {
  slider = document.getElementById('timeline-slider') as HTMLInputElement;
  playBtn = document.getElementById('play-btn') as HTMLButtonElement;
  playIcon = document.getElementById('play-icon') as HTMLElement;
  dateDisplay = document.getElementById('timeline-date') as HTMLElement;
  weekCount = document.getElementById('timeline-week-count') as HTMLElement;
  speedBtn = document.getElementById('speed-btn') as HTMLButtonElement;

  slider.addEventListener('input', () => {
    const idx = parseInt(slider.value, 10);
    setWeekIndex(idx);
  });

  playBtn.addEventListener('click', () => {
    togglePlay();
  });

  speedBtn.addEventListener('click', () => {
    const speeds = [0.5, 1, 2, 4];
    const currentIdx = speeds.indexOf(state.playbackSpeed);
    const nextIdx = (currentIdx + 1) % speeds.length;
    setPlaybackSpeed(speeds[nextIdx]);
    speedBtn.textContent = `${speeds[nextIdx]}x`;
  });

  subscribe(updateTimelineUI, ['currentWeekIndex', 'isPlaying', 'playbackSpeed']);
  startAnimationLoop();
}

function updateTimelineUI(): void {
  slider.max = String(state.weeks.length - 1);
  slider.value = String(state.currentWeekIndex);

  const week = getCurrentWeek();
  dateDisplay.textContent = week ? formatDate(week) : '';
  weekCount.textContent = `${state.currentWeekIndex + 1} / ${state.weeks.length}`;

  playIcon.innerHTML = state.isPlaying ? '&#10074;&#10074;' : '&#9654;';
}

function startAnimationLoop(): void {
  function frame(time: number): void {
    if (state.isPlaying && state.weeks.length > 0) {
      const interval = getWeekInterval();
      if (time - lastFrameTime >= interval) {
        lastFrameTime = time;
        const next = state.currentWeekIndex + 1;
        if (next >= state.weeks.length) {
          dateAnimation = null;
          setWeekIndex(0);
        } else {
          startDateAnimation(state.currentWeekIndex, next, time, interval);
          setWeekIndex(next);
        }
      }
      animateDate(time);
    } else {
      dateAnimation = null;
    }
    animationFrame = requestAnimationFrame(frame);
  }

  animationFrame = requestAnimationFrame(frame);
}

function startDateAnimation(fromIndex: number, toIndex: number, time: number, duration: number): void {
  dateAnimation = {
    startMs: new Date(state.weeks[fromIndex]).getTime(),
    endMs: new Date(state.weeks[toIndex]).getTime(),
    startTime: time,
    duration,
  };
}

function animateDate(time: number): void {
  if (!dateAnimation) return;
  const t = Math.min((time - dateAnimation.startTime) / dateAnimation.duration, 1);
  const totalDays = (dateAnimation.endMs - dateAnimation.startMs) / DAY_MS;
  const days = Math.floor(totalDays * t);
  dateDisplay.textContent = formatDateFromMs(dateAnimation.startMs + days * DAY_MS);
  if (t >= 1) dateAnimation = null;
}
