/**
 * HTML/text email templates. Plain table-based markup with inline styles so
 * the output renders consistently in common email clients.
 */

import { formatPhoenixGameTime } from "./email-time";
import type { StoredGame } from "./email-reminder";
import type { WeeklyRecapModel } from "./email-recap";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const COLORS = {
  bg: "#0b1220",
  card: "#ffffff",
  headerFrom: "#16243f",
  headerTo: "#0f1a30",
  accent: "#f59e0b",
  win: "#16a34a",
  loss: "#dc2626",
  pending: "#6b7280",
  text: "#1f2937",
  muted: "#6b7280",
};

function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.bg};">
  <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(
    title
  )}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLORS.bg};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:${COLORS.card};border-radius:16px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:${COLORS.text};">
          <tr>
            <td style="background:linear-gradient(135deg,${COLORS.headerFrom},${COLORS.headerTo});padding:28px 24px;text-align:center;">
              <div style="font-size:36px;line-height:1;">🏈</div>
              <div style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:0.5px;margin-top:8px;">NFL PICKS</div>
            </td>
          </tr>
          ${body}
          <tr>
            <td style="padding:20px 24px;text-align:center;color:${COLORS.muted};font-size:12px;line-height:1.5;">
              You&rsquo;re getting this email because you play NFL Picks.<br/>
              Manage email preferences from the settings menu in the app.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaButton(url: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
    <tr>
      <td style="background-color:${COLORS.accent};border-radius:999px;">
        <a href="${escapeHtml(
          url
        )}" style="display:inline-block;padding:14px 32px;color:#111827;font-size:16px;font-weight:800;text-decoration:none;">${escapeHtml(
    label
  )}</a>
      </td>
    </tr>
  </table>`;
}

export interface ReminderEmailModel {
  displayName: string;
  weekLabel: string;
  missingGames: StoredGame[];
  appUrl: string;
}

export function renderReminderEmail(model: ReminderEmailModel): RenderedEmail {
  const count = model.missingGames.length;
  const subject = `⏰ ${count} pick${count === 1 ? "" : "s"} left for ${model.weekLabel}`;

  const rows = model.missingGames
    .map(
      (game) => `<tr>
        <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;">
          <div style="font-size:15px;font-weight:700;color:${COLORS.text};">${escapeHtml(
        game.away.name
      )} <span style="color:${COLORS.muted};font-weight:600;">at</span> ${escapeHtml(
        game.home.name
      )}</div>
          <div style="font-size:12px;color:${COLORS.muted};margin-top:2px;">${escapeHtml(
        formatPhoenixGameTime(new Date(game.date))
      )}</div>
        </td>
      </tr>`
    )
    .join("");

  const html = layout(
    subject,
    `<tr>
      <td style="padding:28px 24px 8px;text-align:center;">
        <div style="font-size:26px;font-weight:800;color:${COLORS.text};">Picks due soon, ${escapeHtml(
      model.displayName
    )}!</div>
        <div style="margin-top:8px;font-size:15px;color:${COLORS.muted};">You still have
          <span style="display:inline-block;background-color:${COLORS.accent};color:#111827;font-weight:800;border-radius:999px;padding:2px 12px;">${count}</span>
          game${count === 1 ? "" : "s"} left to pick for ${escapeHtml(
      model.weekLabel
    )}.</div>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 24px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          ${rows}
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:24px;text-align:center;">${ctaButton(
        `${model.appUrl}/`,
        "Make your picks"
      )}</td>
    </tr>`
  );

  const lines = model.missingGames.map(
    (game) =>
      `- ${game.away.name} at ${game.home.name} (${formatPhoenixGameTime(
        new Date(game.date)
      )})`
  );
  const text = `Picks due soon, ${model.displayName}!\n\nYou still have ${count} game${
    count === 1 ? "" : "s"
  } left to pick for ${model.weekLabel}:\n${lines.join("\n")}\n\nMake your picks: ${
    model.appUrl
  }/`;

  return { subject, html, text };
}

function resultBadge(result: "win" | "loss" | "pending"): string {
  const config = {
    win: { bg: COLORS.win, label: "W" },
    loss: { bg: COLORS.loss, label: "L" },
    pending: { bg: COLORS.pending, label: "–" },
  }[result];
  return `<span style="display:inline-block;min-width:28px;text-align:center;background-color:${config.bg};color:#ffffff;font-weight:800;font-size:13px;border-radius:8px;padding:3px 8px;">${config.label}</span>`;
}

function statCell(label: string, value: string): string {
  return `<td width="25%" style="padding:12px 8px;text-align:center;border:1px solid #e5e7eb;">
    <div style="font-size:20px;font-weight:800;color:${COLORS.text};">${escapeHtml(
    value
  )}</div>
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:${COLORS.muted};margin-top:2px;">${escapeHtml(
    label
  )}</div>
  </td>`;
}

export function renderRecapEmail(model: WeeklyRecapModel): RenderedEmail {
  const record = `${model.weeklyWins}-${model.weeklyLosses}${
    model.weeklyPending ? `-${model.weeklyPending}` : ""
  }`;
  const subject = `🏈 ${model.weekLabel} recap: ${record} — ${model.headline}`;

  const movement =
    model.rankDelta === null
      ? "—"
      : model.rankDelta > 0
      ? `▲ ${model.rankDelta}`
      : model.rankDelta < 0
      ? `▼ ${Math.abs(model.rankDelta)}`
      : "–";

  const resultRows = model.results
    .map(
      (r) => `<tr>
        <td style="padding:9px 12px;border-bottom:1px solid #e5e7eb;">${resultBadge(
          r.result
        )}</td>
        <td style="padding:9px 4px;border-bottom:1px solid #e5e7eb;">
          <div style="font-size:14px;font-weight:600;color:${COLORS.text};">${escapeHtml(
            r.matchup
          )}</div>
          <div style="font-size:12px;color:${COLORS.muted};">Your pick: ${escapeHtml(
            r.pickedTeamName
          )}${r.scoreText ? ` · Final ${escapeHtml(r.scoreText)}` : ""}</div>
        </td>
      </tr>`
    )
    .join("");

  const podiumColors = ["#eab308", "#9ca3af", "#d97706"];
  const topThreeRows = model.topThree
    .map(
      (row) => `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;width:36px;">
          <span style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;border-radius:999px;background-color:${
            podiumColors[row.rank - 1] ?? COLORS.pending
          };color:#111827;font-weight:800;font-size:13px;">${row.rank}</span>
        </td>
        <td style="padding:8px 4px;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:${
          row.isUser ? "800" : "600"
        };color:${COLORS.text};">${escapeHtml(row.displayName)}${
        row.isUser ? ' <span style="color:' + COLORS.muted + ';font-size:12px;">(you)</span>' : ""
      }</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-size:13px;color:${COLORS.muted};font-weight:600;">${row.wins}W–${row.losses}L</td>
      </tr>`
    )
    .join("");

  const bestPickBlock = model.bestPick
    ? `<tr>
        <td style="padding:0 24px 8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fffbeb;border:1px solid #fcd34d;border-radius:12px;">
            <tr>
              <td style="padding:14px 16px;">
                <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;color:#b45309;">Boldest call 🎯</div>
                <div style="font-size:15px;font-weight:700;color:${COLORS.text};margin-top:4px;">${escapeHtml(
                  model.bestPick.pickedTeamName
                )} over ${escapeHtml(model.bestPick.matchup)}</div>
                <div style="font-size:12px;color:${COLORS.muted};margin-top:2px;">Only ${
                  model.bestPick.pickersForTeam
                } of ${model.bestPick.totalPickers} pickers took them.</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : "";

  const resultsBlock = resultRows
    ? `<tr>
        <td style="padding:0 24px 8px;">
          <div style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;color:${COLORS.muted};padding-bottom:8px;">Your picks</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
            ${resultRows}
          </table>
        </td>
      </tr>`
    : "";

  const html = layout(
    subject,
    `<tr>
      <td style="padding:28px 24px 4px;text-align:center;">
        <div style="font-size:13px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:${COLORS.accent};">${escapeHtml(
      model.weekLabel
    )} · ${model.year} Season</div>
        <div style="font-size:28px;font-weight:800;color:${COLORS.text};margin-top:6px;">${escapeHtml(
      model.headline
    )}</div>
        <div style="font-size:15px;color:${COLORS.muted};margin-top:4px;">${escapeHtml(
      model.displayName
    )}, here&rsquo;s how your week shook out.</div>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 24px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            ${statCell("This week", record)}
            ${statCell("Week rank", `#${model.weeklyRank}`)}
            ${statCell("Season", `${model.seasonWins}-${model.seasonLosses}`)}
            ${statCell("Overall", `#${model.overallRank} of ${model.totalPlayers}`)}
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:8px 24px 16px;text-align:center;">
        <span style="display:inline-block;background-color:#f3f4f6;border-radius:999px;padding:6px 16px;font-size:13px;font-weight:700;color:${COLORS.text};">
          Leaderboard movement: ${movement}${
      model.previousRank !== null
        ? ` <span style="color:${COLORS.muted};font-weight:600;">(was #${model.previousRank})</span>`
        : ""
    }
        </span>
      </td>
    </tr>
    ${bestPickBlock}
    ${resultsBlock}
    <tr>
      <td style="padding:8px 24px 16px;">
        <div style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:0.5px;color:${COLORS.muted};padding-bottom:8px;">Season top 3</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">
          ${topThreeRows}
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:16px 24px 24px;text-align:center;">${ctaButton(
        `${model.appUrl}/`,
        "Open NFL Picks"
      )}</td>
    </tr>`
  );

  const text = `${model.weekLabel} recap (${model.year} season)\n\n${
    model.headline
  }\n${model.displayName}, here's how your week shook out.\n\nThis week: ${record}\nWeek rank: #${
    model.weeklyRank
  }\nSeason: ${model.seasonWins}-${model.seasonLosses}\nOverall: #${
    model.overallRank
  } of ${model.totalPlayers}\nLeaderboard movement: ${movement}${
    model.bestPick
      ? `\n\nBoldest call: ${model.bestPick.pickedTeamName} — only ${model.bestPick.pickersForTeam} of ${model.bestPick.totalPickers} pickers took them.`
      : ""
  }\n\nOpen NFL Picks: ${model.appUrl}/`;

  return { subject, html, text };
}
