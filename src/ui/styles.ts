// Scoped styles for the settings page. Colours come from the host theme's CSS
// variables (the same ones behind context.theme's classes), so the page
// follows light/dark mode and installed themes; hover, focus and the narrow
// layout need real CSS, which inline styles can't express.

const accent = 'rgb(var(--common-accent, 255 204 102))';
const primary = 'var(--button-primary-bg, #3fa3d9)';
const mix = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;
const success = 'var(--status-success, #87d96c)';
const error = 'var(--status-error, #f27983)';
const warning = 'var(--status-warning, #ffd173)';
const info = 'var(--status-info, #73d0ff)';
const line = 'var(--ui-line, #171b24)';
const mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

export const STYLES = `
.vs-root{container-type:inline-size;height:100%;overflow-y:auto;background:var(--editor-bg);color:var(--ui-fg);font-size:13px;line-height:1.45}
.vs-root *{box-sizing:border-box}
.vs-shell{max-width:1000px;margin:0 auto;padding:28px 24px 56px;display:flex;flex-direction:column;gap:20px}
.vs-muted{color:var(--syntax-comment, #8a9199)}
.vs-mono{font-family:${mono}}
.vs-small{font-size:12px}
.vs-row{display:flex;align-items:center;gap:8px}
.vs-grow{flex:1;min-width:0}
.vs-truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.vs-header{display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap}
.vs-logo{width:40px;height:40px;border-radius:10px;display:grid;place-items:center;flex:none;background:rgb(var(--common-accent, 255 204 102) / .14);color:${accent}}
.vs-title{font-size:20px;font-weight:600;margin:0;line-height:1.2}
.vs-cachebar{display:flex;align-items:center;gap:8px;padding:5px 5px 5px 12px;border:1px solid ${line};border-radius:9px;background:var(--ui-surface)}
.vs-cachebar .vs-input{width:64px;padding:4px 8px;text-align:right}

.vs-warning{display:flex;gap:10px;padding:12px 14px;border-radius:9px;border:1px solid ${mix(warning, 40)};background:${mix(warning, 10)}}

.vs-layout{display:grid;grid-template-columns:220px minmax(0,1fr);gap:20px;align-items:start}
.vs-nav{display:flex;flex-direction:column;gap:2px;position:sticky;top:0}
.vs-nav-label{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;padding:0 10px 6px}
.vs-nav-item{display:flex;align-items:center;gap:10px;width:100%;padding:8px 10px;border-radius:8px;border:1px solid transparent;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
.vs-nav-item:hover{background:var(--ui-hover)}
.vs-nav-item[aria-current="true"]{background:var(--ui-surface);border-color:${line}}
.vs-nav-item:focus-visible,.vs-tab:focus-visible,.vs-btn:focus-visible,.vs-tree-row:focus-visible{outline:2px solid ${primary};outline-offset:1px}
.vs-nav-name{font-weight:500}
.vs-nav-ns{font-size:11px}
.vs-unsaved{width:6px;height:6px;border-radius:50%;background:${accent};flex:none}

.vs-dot{width:8px;height:8px;border-radius:50%;flex:none;background:var(--syntax-comment, #8a9199)}
.vs-dot[data-state="connected"]{background:${success};box-shadow:0 0 0 3px ${mix(success, 20)}}
.vs-dot[data-state="error"]{background:${error};box-shadow:0 0 0 3px ${mix(error, 20)}}
.vs-dot[data-state="ready"]{background:${info}}
.vs-dot[data-state="setup"]{background:transparent;border:1.5px solid var(--syntax-comment, #8a9199)}

.vs-pill{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:500;padding:2px 9px;border-radius:999px;border:1px solid ${line};white-space:nowrap}
.vs-pill[data-state="connected"]{color:${success};border-color:${mix(success, 35)};background:${mix(success, 10)}}
.vs-pill[data-state="error"]{color:${error};border-color:${mix(error, 35)};background:${mix(error, 10)}}
.vs-pill[data-state="ready"]{color:${info};border-color:${mix(info, 35)};background:${mix(info, 10)}}

.vs-card{background:var(--ui-surface);border:1px solid ${line};border-radius:12px;min-width:0}
.vs-card-head{padding:18px 20px 0;display:flex;align-items:flex-start;gap:12px;flex-wrap:wrap}
.vs-card-title{font-size:16px;font-weight:600;margin:0}
.vs-tabs{display:flex;gap:2px;border-bottom:1px solid ${line};padding:0 12px;margin-top:14px;overflow-x:auto}
.vs-tab{background:none;border:none;border-bottom:2px solid transparent;margin-bottom:-1px;color:inherit;font:inherit;padding:9px 10px;cursor:pointer;opacity:.65;white-space:nowrap}
.vs-tab:hover{opacity:1}
.vs-tab[aria-selected="true"]{opacity:1;font-weight:500;border-bottom-color:${accent}}
.vs-body{padding:20px;display:flex;flex-direction:column;gap:16px}

.vs-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.vs-field{display:flex;flex-direction:column;gap:6px;min-width:0}
.vs-label{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.vs-label-text{font-weight:500}
.vs-env{font-family:${mono};font-size:10.5px;padding:0 6px;border-radius:4px;border:1px solid ${line};cursor:help}
.vs-input{width:100%;padding:7px 10px;border-radius:7px;border:1px solid ${line};background:var(--editor-bg);color:inherit;font-family:${mono};font-size:12.5px;outline:none}
.vs-input::placeholder{color:var(--syntax-comment, #8a9199);opacity:.7}
.vs-input:focus{border-color:${primary};box-shadow:0 0 0 3px ${mix(primary, 22)}}
select.vs-input{font-family:inherit;font-size:13px;cursor:pointer}
.vs-input-wrap{position:relative;flex:1;min-width:0}
.vs-input-wrap .vs-input{padding-right:34px}
.vs-input-icon{position:absolute;right:4px;top:50%;transform:translateY(-50%)}

.vs-secret-saved{display:flex;align-items:center;gap:8px;padding:4px 4px 4px 10px;border:1px dashed ${line};border-radius:7px;min-height:34px}
.vs-secret-badge{display:inline-flex;align-items:center;gap:5px;color:${success};font-size:12px}
.vs-secret-badge[data-session="true"]{color:${warning}}

.vs-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:6px 12px;border-radius:7px;border:1px solid ${line};background:var(--ui-panel-bg);color:inherit;font:inherit;line-height:1.3;cursor:pointer;white-space:nowrap;transition:background .12s}
.vs-btn:hover:not(:disabled){background:var(--ui-hover)}
.vs-btn:disabled{opacity:.5;cursor:default}
.vs-btn-primary{background:${primary};border-color:transparent;color:var(--ui-bg, #1f2430);font-weight:500}
.vs-btn-primary:hover:not(:disabled){background:var(--button-primary-hover, ${primary})}
.vs-btn-ghost{background:none;border-color:transparent}
.vs-btn-icon{padding:5px;background:none;border-color:transparent}
.vs-btn-sm{padding:3px 8px;font-size:12px}
.vs-btn-danger{color:${error}}

.vs-footer{position:sticky;bottom:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 20px;border-top:1px solid ${line};background:var(--ui-surface);border-radius:0 0 12px 12px}

.vs-banner{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:9px;border:1px solid ${line}}
.vs-banner[data-kind="ok"]{border-color:${mix(success, 35)};background:${mix(success, 8)}}
.vs-banner[data-kind="ok"] .vs-banner-icon{color:${success}}
.vs-banner[data-kind="error"]{border-color:${mix(error, 35)};background:${mix(error, 8)}}
.vs-banner[data-kind="error"] .vs-banner-icon{color:${error}}
.vs-banner[data-kind="info"]{background:var(--ui-panel-bg)}
.vs-banner-icon{margin-top:1px}

.vs-code{font-family:${mono};font-size:12px;padding:1px 6px;border-radius:5px;background:var(--ui-hover);word-break:break-all}
.vs-code-btn{border:none;color:inherit;cursor:pointer}
.vs-code-btn:hover{background:var(--ui-selection-normal)}
.vs-pre{font-family:${mono};font-size:12px;padding:12px 14px;border-radius:8px;background:var(--editor-bg);border:1px solid ${line};margin:0;white-space:pre-wrap;word-break:break-all}
.vs-ref{color:${accent}}

.vs-section-title{font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin:0 0 8px}
.vs-table{width:100%;border-collapse:collapse;font-size:inherit;color:inherit}
.vs-table td{padding:7px 8px;border-top:1px solid ${line};vertical-align:top}
.vs-table tr:first-child td{border-top:none}
.vs-steps{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px}

.vs-tree{border:1px solid ${line};border-radius:9px;background:var(--editor-bg);padding:4px;max-height:460px;overflow:auto}
.vs-tree-row{display:flex;align-items:center;gap:6px;padding:4px 6px;border-radius:6px;cursor:pointer;min-height:28px;border:none;background:none;color:inherit;font:inherit;width:100%;text-align:left}
.vs-tree-row:hover{background:var(--ui-hover)}
.vs-tree-row .vs-copy-hint{opacity:0;transition:opacity .12s}
.vs-tree-row:hover .vs-copy-hint,.vs-tree-row:focus-visible .vs-copy-hint{opacity:1}
.vs-chevron{transition:transform .12s;opacity:.6}
.vs-chevron[data-open="true"]{transform:rotate(90deg)}
.vs-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:32px 16px;text-align:center}

.vs-spin{animation:vs-spin .9s linear infinite}
@keyframes vs-spin{to{transform:rotate(360deg)}}

@container (max-width: 760px){
  .vs-layout{grid-template-columns:minmax(0,1fr)}
  .vs-nav{flex-direction:row;overflow-x:auto;position:static;padding-bottom:2px}
  .vs-nav-label{display:none}
  .vs-nav-item{width:auto;flex:none}
  .vs-nav-ns{display:none}
}
@container (max-width: 560px){
  .vs-grid{grid-template-columns:minmax(0,1fr)}
  .vs-shell{padding:20px 16px 40px}
  .vs-body{padding:16px}
}
`;
