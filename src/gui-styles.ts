/**
 * Styles for the Relay panel. Everything is scoped under `.rl` so nothing leaks into the host, and every colour comes from the host's own theme
 * variables with a neutral fallback, so the panel follows light and dark themes. Plain CSS in a string because the GUI bundle has no CSS pipeline.
 */
export const panelCss = `
.rl{--rl-fg:var(--text-base,#2b2f36);--rl-strong:var(--text-strong,#14171c);--rl-weak:var(--text-weak,#6e7681);--rl-bg:var(--background-base,#fff);
--rl-card:var(--surface-raised-base,rgba(127,127,127,.07));--rl-inset:var(--surface-inset-base,rgba(127,127,127,.11));--rl-hover:var(--surface-base-hover,rgba(127,127,127,.15));
--rl-line:var(--border-weak-base,rgba(127,127,127,.22));--rl-line2:var(--border-base,rgba(127,127,127,.38));--rl-accent:var(--text-interactive-base,#4f7cff);
--rl-ok:var(--icon-success-base,#2ea36a);--rl-warn:var(--icon-warning-base,#d99a1c);--rl-bad:var(--icon-critical-base,#d9483b);--rl-wait:#8a7cf0;
display:flex;flex-direction:column;height:100%;min-height:0;color:var(--rl-fg);font-size:13px;line-height:1.4}
.rl *{box-sizing:border-box}
.rl h2,.rl h3,.rl p{margin:0}
.rl-top{display:grid;gap:10px;padding:14px 14px 0;flex:none}
.rl-brand{display:flex;align-items:center;gap:8px;min-width:0}
.rl-logo{flex:none;width:22px;height:22px;border-radius:7px;display:grid;place-items:center;color:#fff;font-size:12px;font-weight:700;background:linear-gradient(135deg,var(--rl-accent),#9b6bff)}
.rl-name{font-size:15px;font-weight:650;color:var(--rl-strong)}
.rl-tag{margin-left:auto;color:var(--rl-weak);font-size:11px;white-space:nowrap}
.rl-body{flex:1;min-height:0;overflow:auto;display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:max-content;gap:12px;align-content:start;padding:12px 14px 18px}
.rl-card{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;padding:12px;border:1px solid var(--rl-line);border-radius:12px;background:var(--rl-card)}
.rl-row{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}
.rl-inline{display:flex;align-items:center;gap:6px}
.rl-inline .rl-in{flex:1;min-width:0}
.rl-hint{margin:0;color:var(--rl-weak);font-size:11.5px;overflow-wrap:anywhere}
.rl-in{width:100%;min-width:0;padding:7px 9px;border:1px solid var(--rl-line);border-radius:8px;background:var(--rl-inset);color:var(--rl-strong);font:inherit;outline:none}
.rl-in:focus{border-color:var(--rl-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--rl-accent) 22%,transparent)}
.rl-in:disabled{opacity:.55}
.rl-btn{appearance:none;padding:6px 12px;border:1px solid var(--rl-line2);border-radius:8px;background:transparent;color:var(--rl-fg);font:inherit;font-weight:550;cursor:pointer;white-space:nowrap}
.rl-btn:hover:not(:disabled){background:var(--rl-hover)}
.rl-btn:disabled{opacity:.5;cursor:default}
.rl-btn.sm{padding:3px 9px;font-size:12px}
.rl button:focus-visible,.rl summary:focus-visible,.rl input:focus-visible,.rl select:focus-visible{outline:2px solid var(--rl-accent);outline-offset:2px}
.rl-note{--c:var(--rl-accent);display:grid;grid-template-columns:minmax(0,1fr);gap:2px;padding:8px 10px;border:1px solid color-mix(in srgb,var(--c) 32%,transparent);border-radius:10px;background:color-mix(in srgb,var(--c) 11%,transparent);font-size:12px;overflow-wrap:anywhere}
.rl-note.n-bad{--c:var(--rl-bad)}.rl-note.n-warn{--c:var(--rl-warn)}.rl-note.n-ok{--c:var(--rl-ok)}
.rl-pre{margin:6px 0 0;padding:8px;max-height:220px;overflow:auto;border-radius:8px;background:var(--rl-inset);font-size:11px;white-space:pre-wrap;overflow-wrap:anywhere}
.rl-acc{border:1px solid var(--rl-line);border-radius:12px;background:var(--rl-card)}
.rl-acc>summary{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:11px;color:var(--rl-strong);font-weight:600;cursor:pointer;list-style:none}
.rl-acc>summary::-webkit-details-marker{display:none}
.rl-acc>summary::after{content:"\\203A";margin-left:auto;color:var(--rl-weak);transition:transform .15s}
.rl-acc[open]>summary::after{transform:rotate(90deg)}
.rl-acc[open]>summary{border-radius:11px 11px 0 0}
.rl-acc>summary:hover{background:var(--rl-hover)}
.rl-sub{margin-left:2px;color:var(--rl-weak);font-size:11px;font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rl-acc-body{display:grid;grid-template-columns:minmax(0,1fr);gap:10px;padding:4px 12px 12px}
.rl-pick{display:grid;grid-template-columns:minmax(0,1fr);gap:4px}
.rl-pick .rl-chip{justify-self:start}
.rl-chip{display:inline-flex;align-items:center;gap:6px;max-width:100%;padding:3px 4px 3px 10px;border:1px solid var(--rl-line);border-radius:99px;background:var(--rl-inset);font-size:12px}
.rl-chip.bad{border-color:color-mix(in srgb,var(--rl-bad) 50%,transparent)}
.rl-chip-t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rl-chip small{color:var(--rl-bad)}
.rl-x{appearance:none;flex:none;width:18px;height:18px;padding:0;border:0;border-radius:50%;background:transparent;color:var(--rl-weak);font:inherit;line-height:1;cursor:pointer}
.rl-x:hover:not(:disabled){background:var(--rl-hover);color:var(--rl-strong)}
.rl-role{display:block;color:var(--rl-strong);font-weight:650}
.rl .rl-plain{margin:0;padding:0;list-style:none;display:grid;gap:6px}
.rl-add{justify-self:start}
.rl-inline .rl-effort{flex:none;width:auto;padding:3px 6px;font-size:12px}
.rl-picker{display:grid;grid-template-columns:minmax(0,1fr);gap:6px}
.rl-table-wrap{max-height:320px;overflow:auto;border:1px solid var(--rl-line);border-radius:8px;background:var(--rl-bg)}
.rl-table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed}
.rl-table th:nth-child(2){width:74px}.rl-table th:nth-child(3){width:46px;text-align:right;white-space:nowrap}.rl-table th:nth-child(4){width:42px;text-align:right;white-space:nowrap}.rl-table th:nth-child(5){width:46px}
.rl-table th{position:sticky;top:0;z-index:1;padding:5px 4px;border-bottom:1px solid var(--rl-line2);background:var(--rl-bg);color:var(--rl-weak);font-size:11px;font-weight:600;text-align:left;vertical-align:bottom}
.rl-table td{padding:5px 4px;border-top:1px solid var(--rl-line);vertical-align:middle;overflow-wrap:anywhere}
.rl-table tbody tr:first-child td{border-top:0}
.rl-table tbody tr:hover{background:var(--rl-hover)}
.rl-table td:nth-child(3),.rl-table td:nth-child(4){text-align:right;white-space:nowrap}
.rl-table td:last-child{text-align:right}
.rl-table small{display:block;color:var(--rl-weak);font-size:11px;font-weight:400}
.rl-t-name{color:var(--rl-strong);font-weight:550}
.rl-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.rl-seg{display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.rl-seg .rl-btn[aria-pressed=true]{background:var(--rl-inset);border-color:var(--rl-accent);color:var(--rl-strong)}
.rl-right{margin-left:auto}
.rl-filters{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:6px}
.rl-chart{display:block;width:100%;height:110px}
.rl-chart g:hover rect[fill=transparent]{fill:var(--rl-hover)}
.rl-legend{display:flex;flex-wrap:wrap;gap:4px 10px;color:var(--rl-weak);font-size:11px}
.rl-dot{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:4px;vertical-align:baseline}
.rl-u-tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.rl-u-tile{display:grid;gap:1px;align-content:start;min-width:0;padding:10px 12px;border:1px solid var(--rl-line);border-radius:12px;background:var(--rl-card)}
.rl-u-big{color:var(--rl-strong);font-size:22px;font-weight:700;line-height:1.2;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.rl-u-plot{position:relative;padding-top:16px;border:1px solid var(--rl-line);border-radius:8px;background:var(--rl-bg);overflow:hidden}
.rl-u-scale{position:absolute;top:2px;left:6px;color:var(--rl-weak);font-size:10.5px;font-variant-numeric:tabular-nums}
.rl-u-empty{position:absolute;inset:0;display:grid;place-items:center;padding:0 12px;color:var(--rl-weak);font-size:11.5px;text-align:center}
.rl-u-days{display:grid;margin-top:3px;color:var(--rl-weak);font-size:10px;text-align:center;white-space:nowrap}
.rl .rl-u-list{margin:0;padding:0;list-style:none;border:1px solid var(--rl-line);border-radius:10px;background:var(--rl-bg);overflow:hidden}
.rl-u-list>li+li{border-top:1px solid var(--rl-line)}
.rl-u-item{display:grid;gap:1px;width:100%;min-width:0;padding:7px 10px;border:0;background:none;color:inherit;font:inherit;text-align:left}
button.rl-u-item{cursor:pointer}
button.rl-u-item:hover{background:var(--rl-hover)}
.rl-u-line{display:flex;align-items:baseline;gap:8px;min-width:0}
.rl-u-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--rl-strong);font-weight:550}
.rl-u-money{flex:none;margin-left:auto;color:var(--rl-strong);font-weight:650;font-variant-numeric:tabular-nums}
.rl-u-when{flex:none;color:var(--rl-weak);font-size:11.5px;font-variant-numeric:tabular-nums}
.rl-u-small{color:var(--rl-weak);font-size:11.5px;overflow-wrap:anywhere}
.rl-u-badge{padding:0 7px;border-radius:99px;background:var(--rl-inset);color:var(--rl-strong);font-size:11px;font-weight:600}
`;
