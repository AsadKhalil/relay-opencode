// Stand-ins for the modules OpenCode Desktop gives a plugin's GUI. Only what src/gui.tsx and src/contract.ts use at run time.
export const Panel = Symbol('Panel'), Command = Symbol('Command'), ComposerPill = Symbol('ComposerPill');
export const Plugin = { define: <T>(definition: T) => definition };
export const Rpc = { define: <T>(definition: T) => definition };
