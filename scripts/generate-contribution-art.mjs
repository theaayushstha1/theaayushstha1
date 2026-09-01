import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const outputPath = resolve(process.argv[2] ?? "dist/metrics.plugin.isocalendar.svg");
const token = process.env.GITHUB_TOKEN?.trim();
const login = (
  process.env.GITHUB_USER ??
  process.env.GITHUB_REPOSITORY_OWNER ??
  "theaayushstha1"
).trim();

if (!token) {
  throw new Error("GITHUB_TOKEN is required");
}

const now = new Date();
const from = new Date(now);
from.setUTCDate(from.getUTCDate() - 371);

const query = `
  query ContributionCalendar($login: String!, $from: DateTime!, $to: DateTime!) {
    user(login: $login) {
      contributionsCollection(from: $from, to: $to) {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              contributionCount
              contributionLevel
              date
            }
          }
        }
      }
    }
  }
`;

const response = await fetch("https://api.github.com/graphql", {
  method: "POST",
  headers: {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "theaayushstha1-profile-calendar",
  },
  body: JSON.stringify({
    query,
    variables: {
      login,
      from: from.toISOString(),
      to: now.toISOString(),
    },
  }),
});

if (!response.ok) {
  throw new Error(`GitHub GraphQL request failed with ${response.status}`);
}

const payload = await response.json();
if (payload.errors?.length) {
  throw new Error(payload.errors.map((error) => error.message).join("; "));
}

const calendar = payload.data?.user?.contributionsCollection?.contributionCalendar;
if (!calendar) {
  throw new Error(`No contribution calendar returned for ${login}`);
}

const weeks = calendar.weeks.slice(-53);
const levels = {
  NONE: 0,
  FIRST_QUARTILE: 1,
  SECOND_QUARTILE: 2,
  THIRD_QUARTILE: 3,
  FOURTH_QUARTILE: 4,
};

const halfWidth = 7;
const halfDepth = 4;
const weekX = 14.2;
const weekY = 3.25;
const dayX = -7.2;
const dayY = 8.2;

const cells = weeks.flatMap((week, weekIndex) =>
  week.contributionDays.map((day, dayIndex) => {
    const level = levels[day.contributionLevel] ?? 0;
    const height = level === 0
      ? 0
      : Math.min(30, 3.5 + Math.log2(day.contributionCount + 1) * 3.6);

    return {
      ...day,
      dayIndex,
      height,
      level,
      weekIndex,
      x: weekIndex * weekX + dayIndex * dayX,
      y: weekIndex * weekY + dayIndex * dayY,
    };
  }),
);

const lastDate = cells.map((cell) => cell.date).sort().at(-1);
const minX = Math.min(...cells.map((cell) => cell.x - halfWidth)) - 22;
const maxX = Math.max(...cells.map((cell) => cell.x + halfWidth)) + 22;
const minY = Math.min(...cells.map((cell) => cell.y - cell.height - halfDepth)) - 22;
const maxY = Math.max(...cells.map((cell) => cell.y + halfDepth)) + 24;
const viewWidth = maxX - minX;
const viewHeight = maxY - minY;

const fmt = (number) => Number(number.toFixed(2));
const pointList = (points) => points.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(" ");

const renderedCells = [...cells]
  .sort((left, right) => left.y - right.y || left.x - right.x)
  .map((cell) => {
    const topY = -cell.height;
    const delay = 0.08 + cell.weekIndex * 0.025 + cell.dayIndex * 0.012;
    const top = pointList([
      [0, topY - halfDepth],
      [halfWidth, topY],
      [0, topY + halfDepth],
      [-halfWidth, topY],
    ]);
    const left = pointList([
      [-halfWidth, topY],
      [0, topY + halfDepth],
      [0, halfDepth],
      [-halfWidth, 0],
    ]);
    const right = pointList([
      [halfWidth, topY],
      [0, topY + halfDepth],
      [0, halfDepth],
      [halfWidth, 0],
    ]);
    const isLatest = cell.date === lastDate;

    return `
      <g transform="translate(${fmt(cell.x)} ${fmt(cell.y)})">
        <g class="rise level-${cell.level}" style="--delay:${delay.toFixed(3)}s">
          ${cell.height > 0 ? `<polygon class="face left" points="${left}"/>` : ""}
          ${cell.height > 0 ? `<polygon class="face right" points="${right}"/>` : ""}
          <polygon class="face top" points="${top}"/>
          ${isLatest ? `<polygon class="today-ring" points="${top}"/>` : ""}
        </g>
      </g>`;
  })
  .join("");

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg"
     width="960"
     height="280"
     viewBox="${fmt(minX)} ${fmt(minY)} ${fmt(viewWidth)} ${fmt(viewHeight)}"
     preserveAspectRatio="xMidYMid meet"
     role="img"
     aria-labelledby="title description">
  <title id="title">${login}'s contribution rhythm</title>
  <desc id="description">An animated isometric sculpture built from the last year of GitHub contributions.</desc>
  <style>
    :root {
      color-scheme: light dark;
    }

    .face {
      stroke-linejoin: round;
      stroke-width: 0.55;
      vector-effect: non-scaling-stroke;
    }

    .level-0 { stroke: #dce4de; }
    .level-0 .top { fill: #eef2ef; }
    .level-0 .left { fill: #e2e8e3; }
    .level-0 .right { fill: #d7dfd9; }
    .level-1 { stroke: #93e59f; }
    .level-1 .top { fill: #b9f7c3; }
    .level-1 .left { fill: #83db91; }
    .level-1 .right { fill: #69c979; }
    .level-2 { stroke: #42da59; }
    .level-2 .top { fill: #69ee7d; }
    .level-2 .left { fill: #31cc4b; }
    .level-2 .right { fill: #22af3b; }
    .level-3 { stroke: #1fd437; }
    .level-3 .top { fill: #26ec42; }
    .level-3 .left { fill: #17bd31; }
    .level-3 .right { fill: #0f9424; }
    .level-4 { stroke: #075b18; }
    .level-4 .top { fill: #0a7a20; }
    .level-4 .left { fill: #075b18; }
    .level-4 .right { fill: #044311; }

    .rise {
      animation: rise 650ms var(--delay) cubic-bezier(0.16, 1, 0.3, 1) both;
      opacity: 0;
      transform: translateY(14px);
    }

    .level-0.rise {
      animation: base-reveal 450ms 40ms ease-out both;
      opacity: 0.22;
      transform: none;
    }

    .today-ring {
      animation: today-pulse 3.4s 2s ease-out infinite;
      fill: none;
      opacity: 0;
      stroke: #0a7a20;
      stroke-width: 1.4;
      transform-box: fill-box;
      transform-origin: center;
      vector-effect: non-scaling-stroke;
    }

    @keyframes rise {
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes base-reveal {
      to { opacity: 1; }
    }

    @keyframes today-pulse {
      0% { opacity: 0; transform: scale(0.9); }
      14% { opacity: 0.9; }
      55%, 100% { opacity: 0; transform: scale(1.8); }
    }

    @media (prefers-color-scheme: dark) {
      .level-0 { stroke: #2b312c; }
      .level-0 .top { fill: #202521; }
      .level-0 .left { fill: #171b18; }
      .level-0 .right { fill: #111512; }
      .level-1 { stroke: #0d6b21; }
      .level-1 .top { fill: #0a5a1b; }
      .level-1 .left { fill: #074314; }
      .level-1 .right { fill: #052f0e; }
      .level-2 { stroke: #12a62e; }
      .level-2 .top { fill: #0f9228; }
      .level-2 .left { fill: #0a6f1e; }
      .level-2 .right { fill: #075116; }
      .level-3 { stroke: #1fd437; }
      .level-3 .top { fill: #19c738; }
      .level-3 .left { fill: #109a2a; }
      .level-3 .right { fill: #0a731f; }
      .level-4 { stroke: #4af263; }
      .level-4 .top { fill: #26ec42; }
      .level-4 .left { fill: #1fd437; }
      .level-4 .right { fill: #0a7a20; }
      .today-ring { stroke: #28e0d2; }
    }

    @media (prefers-reduced-motion: reduce) {
      .rise {
        animation: none;
        opacity: 1;
        transform: none;
      }

      .today-ring {
        animation: none;
        opacity: 0.72;
      }
    }
  </style>
  ${renderedCells}
</svg>
`;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, svg, "utf8");
console.log(`Wrote ${outputPath} for ${login} (${calendar.totalContributions} contributions)`);
