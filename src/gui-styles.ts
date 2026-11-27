/**
 * Styles for both Relay panels: a strip board (.impeccable/surfaces/src-gui-tsx.md). Each mode is a bay, each chosen model a paper strip
 * with a coloured slot block, printed field rules and monospace figures. Two lights, day and night, chosen from OpenCode's background
 * (`boardLight` in src/gui-parts.tsx); the panel keeps its own colours. Everything is scoped under `.rl` so nothing leaks into the host.
 * Plain CSS in a string because the GUI bundle has no CSS pipeline. Each selector has one rule (tests/gui-styles.test.ts).
 */
export const panelCss = `
.rl{--rl-bay:#e3e5e0;--rl-rail:#cdd1cb;--rl-paper:#fcfaf4;--rl-rule:#e2dccb;--rl-ink:#1b1d20;--rl-ink2:#434850;--rl-ink3:#575c63;
--rl-plan:#2360d0;--rl-exec:#e19a1c;--rl-review:#1d8553;--rl-ctrl:#6a4fd6;--rl-alert:#c3372b;
--rl-plan-ink:#fff;--rl-exec-ink:#1b1d20;--rl-review-ink:#fff;--rl-ctrl-ink:#fff;
--rl-plan-text:#1d4fae;--rl-exec-text:#7a4d00;--rl-review-text:#14663f;--rl-ctrl-text:#5536c4;
--rl-s1:#0f8b8d;--rl-s2:#c2457a;--rl-s3:#7a6f66;--rl-s4:#93357f;--rl-s5:#8f9230;--rl-s0:#8a9099;--rl-alert-text:#a32a1f;
--rl-lift:0 1px 0 rgba(27,29,32,.07),0 1px 3px rgba(27,29,32,.12);
--rl-mono:ui-monospace,"Cascadia Mono","Cascadia Code","SF Mono",Menlo,Consolas,monospace;
display:flex;flex-direction:column;height:100%;min-height:0;background:var(--rl-bay);color:var(--rl-ink);font-size:13px;line-height:1.4;
color-scheme:light;accent-color:var(--rl-plan);caret-color:var(--rl-ink);scrollbar-color:var(--rl-rail) transparent;scrollbar-width:thin}
.rl[data-light=night]{--rl-bay:#121315;--rl-rail:#26282c;--rl-paper:#2c2b27;--rl-rule:#423e35;--rl-ink:#efede6;--rl-ink2:#c9c5bb;--rl-ink3:#a39f95;
--rl-plan:#6a9dff;--rl-exec:#f2ab2f;--rl-review:#4cc48c;--rl-ctrl:#a593ff;--rl-alert:#ff6f61;
--rl-plan-ink:#0d1117;--rl-exec-ink:#0d1117;--rl-review-ink:#0d1117;--rl-ctrl-ink:#0d1117;
--rl-plan-text:#6a9dff;--rl-exec-text:#f2ab2f;--rl-review-text:#4cc48c;--rl-ctrl-text:#a593ff;
--rl-s1:#3cc4c6;--rl-s2:#ee7eab;--rl-s3:#b3a89e;--rl-s4:#d47fc1;--rl-s5:#c6c95c;--rl-s0:#7f848b;--rl-alert-text:#ff6f61;
--rl-lift:0 1px 0 rgba(0,0,0,.55),0 2px 6px rgba(0,0,0,.35);color-scheme:dark}
.rl *{box-sizing:border-box}
.rl h2,.rl h3,.rl p{margin:0}
.rl ::selection{background:color-mix(in srgb,var(--rl-plan) 30%,transparent)}
.rl ::placeholder{color:var(--rl-ink3);opacity:1}
.rl :focus-visible{outline:2px solid var(--rl-plan);outline-offset:2px}
.rl [data-mode=plan]{--code:var(--rl-plan);--code-ink:var(--rl-plan-ink);--code-text:var(--rl-plan-text)}
.rl [data-mode=execute]{--code:var(--rl-exec);--code-ink:var(--rl-exec-ink);--code-text:var(--rl-exec-text)}
.rl [data-mode=review]{--code:var(--rl-review);--code-ink:var(--rl-review-ink);--code-text:var(--rl-review-text)}
.rl [data-mode=decider]{--code:var(--rl-ctrl);--code-ink:var(--rl-ctrl-ink);--code-text:var(--rl-ctrl-text)}
.rl-icon{flex:none;display:block}
.rl-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}

.rl-top{flex:none;display:flex;align-items:center;gap:8px;padding:12px 14px 8px}
.rl-logo{flex:none;width:22px;height:22px;border-radius:6px;display:grid;place-items:center;color:#fff;font-size:12px;font-weight:700;background:linear-gradient(135deg,#4f7cff,#9b6bff)}
.rl-name{font-size:15px;font-weight:700;letter-spacing:-0.01em;color:var(--rl-ink)}
.rl-right{margin-left:auto}
.rl-body{flex:1;min-height:0;overflow:auto;display:grid;grid-template-columns:minmax(0,1fr);grid-auto-rows:max-content;gap:10px;align-content:start;padding:2px 12px 16px}
.rl-lede{color:var(--rl-ink2);font-size:12.5px;line-height:1.5}
.rl kbd{padding:0 4px;border-radius:3px;background:var(--rl-paper);box-shadow:inset 0 -1px 0 var(--rl-rule);color:var(--rl-ink);font:600 11.5px/1.5 var(--rl-mono)}
.rl-foot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:7px 12px;border-top:1px solid var(--rl-rail);color:var(--rl-ink2);font-size:11.5px}
.rl-foot-r{display:flex;align-items:center;gap:8px}
.rl-ver{color:var(--rl-ink2);font:600 11px/1 var(--rl-mono);font-variant-numeric:tabular-nums}

.rl-bay{display:grid;grid-template-columns:minmax(0,1fr);gap:6px;padding:8px;border-radius:5px;background:color-mix(in srgb,var(--rl-rail) 52%,var(--rl-bay))}
.rl-bay-head{display:flex;align-items:baseline;gap:8px;min-width:0;padding:0 2px}
.rl-bay-head h3{flex:none;color:var(--code-text);font-size:12px;font-weight:750;letter-spacing:.06em;text-transform:uppercase}
.rl-bay-say{min-width:0;color:var(--rl-ink2);font-size:12px}
.rl-bay-note{display:flex;align-items:flex-start;gap:6px;padding:0 2px;color:var(--rl-ink2);font-size:12px}
.rl-bay-note.is-warn{color:var(--rl-alert-text)}
.rl-legend-row{display:grid;grid-template-columns:24px minmax(0,1fr) 66px 38px 36px;column-gap:6px;margin:2px 8px -4px;color:var(--rl-ink3);font:600 10px/1.2 var(--rl-mono);letter-spacing:.03em;text-transform:uppercase}
.rl-legend-row span:nth-child(n+3){text-align:right}

.rl .rl-rack{margin:0;padding:0;list-style:none;display:grid;gap:3px}
.rl-strip{position:relative;display:grid;grid-template-columns:24px minmax(0,1fr) 66px 38px 36px;grid-template-rows:auto auto;column-gap:6px;row-gap:5px;align-items:center;padding:6px 8px 6px 0;border-radius:3px;background:var(--rl-paper);box-shadow:var(--rl-lift);transition:transform .2s cubic-bezier(.16,1,.3,1)}
.rl-strip.is-off{transform:translateX(10px)}
.rl-slot{grid-row:1/3;align-self:stretch;display:grid;place-items:center;margin:-6px 0;border-radius:3px 0 0 3px;background:var(--code);color:var(--code-ink);font:700 12px/1 var(--rl-mono)}
.rl-call{display:grid;gap:1px;min-width:0}
.rl-id{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--rl-ink);font:650 12.5px/1.3 var(--rl-mono)}
.rl-meta{display:flex;align-items:center;gap:6px;min-width:0;color:var(--rl-ink2);font-size:11.5px}
.rl-prov{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rl-eff{flex:none;max-width:72px;padding:0 2px;border:1px solid var(--rl-rule);border-radius:3px;background:var(--rl-paper);color:var(--rl-ink);font:inherit;font-size:11.5px;cursor:pointer}
.rl-f{align-self:stretch;display:flex;align-items:center;justify-content:flex-end;margin:-6px 0;padding-left:6px;border-left:1px solid var(--rl-rule);color:var(--rl-ink);font:550 11.5px/1.15 var(--rl-mono);font-variant-numeric:tabular-nums;text-align:right}
.rl-f.is-est{color:var(--rl-ink3);font-style:italic}
.rl-px{display:grid;justify-items:end;gap:1px}
.rl-row2{grid-column:2/5;display:flex;align-items:center;gap:6px;min-width:0}
.rl-for{flex:1;min-width:0;padding:2px 0;border:0;border-bottom:1px dashed var(--rl-rule);background:transparent;color:var(--rl-ink);font:inherit;font-size:12px}
.rl-for:focus-visible{outline:none;border-bottom:1px solid var(--code)}
.rl-stamp{flex:none;padding:0 5px;border:1.5px solid currentColor;border-radius:3px;color:var(--code-text);font:700 10px/1.45 var(--rl-mono);letter-spacing:.04em;text-transform:uppercase}
.rl-stamp.is-bad{color:var(--rl-alert-text)}
.rl-x{appearance:none;grid-column:5;justify-self:end;display:grid;place-items:center;width:22px;height:22px;padding:0;border:0;border-radius:3px;background:transparent;color:var(--rl-ink3);cursor:pointer}
.rl-x:hover:not(:disabled){background:color-mix(in srgb,var(--rl-alert) 14%,transparent);color:var(--rl-alert)}
.rl-link{appearance:none;padding:0;border:0;background:none;color:var(--code-text);font-family:inherit;font-size:12px;font-weight:600;line-height:1.3;cursor:pointer;text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px}
.rl-slot-empty{appearance:none;display:flex;align-items:center;gap:6px;width:100%;padding:7px 10px;border:1.5px dashed color-mix(in srgb,var(--code) 60%,transparent);border-radius:3px;background:transparent;color:var(--code-text);font-family:inherit;font-size:12.5px;font-weight:600;line-height:1.2;cursor:pointer;text-align:left}
.rl-slot-empty:hover:not(:disabled){background:color-mix(in srgb,var(--code) 9%,transparent)}
.rl-slot-empty.is-go{border-style:solid;background:var(--code);color:var(--code-ink)}
.rl-last{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px;padding:0 2px;color:var(--rl-ink2);font-size:12px}
.rl-tag{flex:none;padding:1px 5px;border-radius:3px;background:var(--code);color:var(--code-ink);font:700 10px/1.4 var(--rl-mono);letter-spacing:.04em;text-transform:uppercase}
.rl-try{display:flex;gap:6px}
.rl-fine{padding:0 2px;color:var(--rl-ink2);font-size:12px}
.rl-fine>summary{display:inline-flex;align-items:center;gap:4px;max-width:100%;color:var(--code-text,var(--rl-ink2));font-weight:600;cursor:pointer;list-style:none;text-decoration:underline dotted;text-underline-offset:3px}
.rl-fine>summary::-webkit-details-marker{display:none}
.rl-fine>summary .rl-icon{transition:transform .15s}
.rl-fine[open]>summary .rl-icon{transform:rotate(90deg)}
.rl-fine>p{margin:6px 0 2px;line-height:1.5}

.rl-cost{appearance:none;display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) auto;align-items:stretch;width:100%;padding:0;border:0;border-radius:3px;background:var(--rl-paper);box-shadow:var(--rl-lift);color:inherit;font:inherit;text-align:left;cursor:pointer;overflow:hidden}
.rl-cost:hover .rl-cost-go{background:var(--rl-plan);color:var(--rl-plan-ink)}
.rl-cost-f{display:grid;align-content:start;gap:2px;min-width:0;padding:7px 10px;border-right:1px solid var(--rl-rule)}
.rl-k{color:var(--rl-ink3);font:600 10px/1.2 var(--rl-mono);letter-spacing:.03em;text-transform:uppercase}
.rl-v{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--rl-ink);font:650 16px/1.2 var(--rl-mono);font-variant-numeric:tabular-nums}
.rl-cost-go{display:flex;align-items:center;gap:4px;padding:0 10px;color:var(--rl-plan);font-size:12px;font-weight:650;transition:background .15s,color .15s}

.rl-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:5px;padding:5px 10px;border:1px solid var(--rl-rail);border-radius:4px;background:var(--rl-paper);color:var(--rl-ink);font-family:inherit;font-size:12px;font-weight:600;line-height:1.2;white-space:nowrap;cursor:pointer}
.rl-btn:hover:not(:disabled){border-color:var(--rl-ink3)}
.rl-btn:disabled{opacity:.5;cursor:default}
.rl-btn.sm{padding:3px 8px;font-size:11.5px}
.rl-in{width:100%;min-width:0;padding:5px 8px;border:1px solid var(--rl-rail);border-radius:4px;background:var(--rl-paper);color:var(--rl-ink);font:inherit;font-size:12.5px;outline:none}
.rl-in:focus{border-color:var(--rl-plan);box-shadow:0 0 0 3px color-mix(in srgb,var(--rl-plan) 20%,transparent)}
.rl-in:disabled{opacity:.55}
.rl-inline{display:flex;align-items:center;gap:6px;min-width:0}
.rl-inline .rl-in{flex:1;min-width:0}
.rl-note{--c:var(--rl-plan);display:flex;align-items:flex-start;gap:8px;padding:8px 10px;border-radius:4px;background:color-mix(in srgb,var(--c) 11%,var(--rl-paper));box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--c) 38%,transparent);color:var(--rl-ink);font-size:12.5px;overflow-wrap:anywhere}
.rl-note .rl-icon{margin-top:2px;color:var(--c)}
.rl-note.n-bad{--c:var(--rl-alert)}.rl-note.n-warn{--c:var(--rl-exec)}.rl-note.n-ok{--c:var(--rl-review)}
.rl-small{color:var(--rl-ink2);font-size:11.5px}

.rl-picker{display:grid;grid-template-columns:minmax(0,1fr);gap:6px;padding:8px;border-radius:3px;background:var(--rl-paper);box-shadow:var(--rl-lift)}
.rl-table-wrap{max-height:320px;overflow:auto;border:1px solid var(--rl-rule);border-radius:3px}
.rl-table{width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed}
.rl-table th:nth-child(2){width:66px}.rl-table th:nth-child(3){width:44px}.rl-table th:nth-child(4){width:40px}.rl-table th:nth-child(5){width:42px}
.rl-table th{position:sticky;top:0;z-index:1;padding:5px 4px;border-bottom:1px solid var(--rl-rail);background:var(--rl-paper);color:var(--rl-ink3);font:600 10px/1.2 var(--rl-mono);letter-spacing:.03em;text-transform:uppercase;text-align:left;vertical-align:bottom}
.rl-table th:nth-child(n+2){text-align:right}
.rl-table th small{display:block;font-weight:500;text-transform:none;letter-spacing:0}
.rl-table td{padding:5px 4px;border-top:1px solid var(--rl-rule);vertical-align:middle}
.rl-table td:nth-child(n+2){text-align:right;font-family:var(--rl-mono);font-variant-numeric:tabular-nums}
.rl-table td.is-est{color:var(--rl-ink3);font-style:italic}
.rl-table tbody tr:first-child td{border-top:0}
.rl-table tbody tr:hover{background:color-mix(in srgb,var(--rl-plan) 7%,transparent)}
.rl-table td small{display:block;color:var(--rl-ink2);font-size:11px;font-family:inherit}
.rl-t-name{color:var(--rl-ink);font-weight:600;overflow-wrap:anywhere}

.rl-drawers{display:grid;gap:4px;margin-top:4px}
.rl-drawer{border-radius:4px;background:color-mix(in srgb,var(--rl-rail) 40%,var(--rl-bay))}
.rl-drawer>summary{display:flex;align-items:center;gap:6px;padding:8px 10px;color:var(--rl-ink);font-weight:600;font-size:12.5px;cursor:pointer;list-style:none}
.rl-drawer>summary::-webkit-details-marker{display:none}
.rl-drawer>summary .rl-icon{color:var(--rl-ink3);transition:transform .15s}
.rl-drawer[open]>summary .rl-icon{transform:rotate(90deg)}
.rl-drawer-t{flex:none}
.rl-sub{min-width:0;margin-left:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--rl-ink3);font-size:11.5px;font-weight:500}
.rl-drawer-body{display:grid;gap:8px;padding:0 10px 10px;color:var(--rl-ink2);font-size:12px;line-height:1.5}
.rl .rl-log{margin:0;padding:0;list-style:none;display:grid;grid-template-columns:max-content max-content minmax(0,1fr) max-content max-content;gap:4px 0}
.rl-log>li{display:grid;grid-column:1/-1;grid-template-columns:subgrid;align-items:center;column-gap:6px;padding:4px 6px;border-radius:3px;background:var(--rl-paper);box-shadow:var(--rl-lift);color:var(--rl-ink);font-size:12px}
.rl-log-head{display:grid;grid-column:1/-1;grid-template-columns:subgrid;column-gap:6px;padding:0 6px;color:var(--rl-ink3);font:600 10px/1.2 var(--rl-mono);letter-spacing:.03em;text-transform:uppercase}
.rl-log-model{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:600 11.5px/1.3 var(--rl-mono)}
.rl-log-f{text-align:right;font:550 11px/1.3 var(--rl-mono);font-variant-numeric:tabular-nums}
.rl-tag.is-none{background:var(--rl-rail);color:var(--rl-ink2)}
.rl-log time{color:var(--rl-ink);font:600 11px/1.4 var(--rl-mono);font-variant-numeric:tabular-nums}
.rl-pre{margin:0;padding:8px;max-height:220px;overflow:auto;border-radius:3px;background:var(--rl-paper);color:var(--rl-ink);font:11px/1.5 var(--rl-mono);white-space:pre-wrap;overflow-wrap:anywhere}

.rl-seg{display:flex;flex-wrap:wrap;gap:3px;align-items:center}
.rl-seg .rl-btn[aria-pressed=true]{border-color:var(--rl-ink);background:var(--rl-ink);color:var(--rl-bay)}
.rl-filters{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:6px}
.rl-chart{display:block;width:100%;height:110px}
.rl-chart g:hover rect[fill=transparent]{fill:color-mix(in srgb,var(--rl-ink) 6%,transparent)}
.rl-legend{display:flex;flex-wrap:wrap;gap:4px 10px;color:var(--rl-ink2);font-size:11px}
.rl-dot{display:inline-block;width:8px;height:8px;border-radius:3px;margin-right:4px;vertical-align:baseline}
.rl-u-sum{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));border-radius:3px;background:var(--rl-paper);box-shadow:var(--rl-lift);overflow:hidden}
.rl-u-sum>.rl-cost-f:last-child{border-right:0}
.rl-u-plate{display:grid;gap:6px;padding:8px 10px 10px;border-radius:3px;background:var(--rl-paper);box-shadow:var(--rl-lift)}
.rl-u-plot{position:relative;padding-top:16px;border-bottom:1px solid var(--rl-rule)}
.rl-u-scale{position:absolute;top:0;left:0;color:var(--rl-ink3);font:10.5px/1.2 var(--rl-mono);font-variant-numeric:tabular-nums}
.rl-u-empty{position:absolute;inset:0;display:grid;place-items:center;padding:0 12px;color:var(--rl-ink2);font-size:11.5px;text-align:center}
.rl-u-days{display:grid;margin-top:3px;color:var(--rl-ink3);font:10px/1.2 var(--rl-mono);text-align:center;white-space:nowrap}
.rl-u-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;padding:0 2px}
.rl-u-head h3{color:var(--rl-ink);font-size:12px;font-weight:750;letter-spacing:.06em;text-transform:uppercase}
.rl .rl-u-list{margin:0;padding:0;list-style:none;display:grid;gap:3px}
.rl-u-item{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;column-gap:8px;width:100%;min-width:0;padding:6px 0 6px 10px;border:0;border-radius:3px;background:var(--rl-paper);box-shadow:var(--rl-lift);color:inherit;font:inherit;text-align:left}
button.rl-u-item{cursor:pointer}
button.rl-u-item:hover{background:color-mix(in srgb,var(--rl-plan) 6%,var(--rl-paper))}
.rl-u-main{display:grid;gap:1px;min-width:0}
.rl-u-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--rl-ink);font:600 12.5px/1.3 var(--rl-mono)}
.rl-u-money{align-self:stretch;display:flex;align-items:center;justify-content:flex-end;min-width:64px;margin:-6px 0;padding:0 10px 0 8px;border-left:1px solid var(--rl-rule);color:var(--rl-ink);font:650 12.5px/1 var(--rl-mono);font-variant-numeric:tabular-nums}
.rl-u-when{color:var(--rl-ink2);font:600 11px/1.3 var(--rl-mono);font-variant-numeric:tabular-nums}
.rl-u-small{min-width:0;color:var(--rl-ink2);font-size:11.5px;overflow-wrap:anywhere}
.rl-u-tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));border:1px solid var(--rl-rule);border-radius:3px}
.rl-u-tiles>.rl-cost-f:nth-child(2n){border-right:0}
.rl-u-tiles>.rl-cost-f:nth-child(-n+2){border-bottom:1px solid var(--rl-rule)}
.rl-u-without{fill:none;stroke:var(--rl-s0);stroke-width:1.25}
.rl-dot-o{background:transparent;box-shadow:inset 0 0 0 1.5px var(--rl-s0)}
.rl-u-sw{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,40%) 32px;align-items:center;column-gap:8px;padding:0 2px}
.rl-u-track{height:6px;border-radius:2px;background:color-mix(in srgb,var(--rl-ink) 8%,transparent)}
.rl-u-track>i{display:block;height:100%;min-width:2px;border-radius:2px}
.rl-u-count{color:var(--rl-ink);font:650 12px/1 var(--rl-mono);font-variant-numeric:tabular-nums;text-align:right}
.rl-u-badge{padding:0 6px;border-radius:3px;background:var(--rl-ink);color:var(--rl-bay);font:700 10.5px/1.5 var(--rl-mono)}

@media (prefers-reduced-motion:no-preference){.rl-arrive{animation:rl-slide-in .28s cubic-bezier(.16,1,.3,1)}}
@keyframes rl-slide-in{from{transform:translateX(32px);opacity:.3}to{transform:none;opacity:1}}
`;
