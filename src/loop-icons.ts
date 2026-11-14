import type {LoopMode} from './logic';
export const loopNames:Record<LoopMode,string>={all:'主列表循环',one:'单章循环',off:'顺序一次',sentence:'单句循环'};
const arrows='<path d="M5 7h13l-3-3m3 3-3 3M19 17H6l3 3m-3-3 3-3M3 12V9a2 2 0 0 1 2-2m16 5v3a2 2 0 0 1-2 2"/>';
const paths:Record<LoopMode,string>={all:arrows,one:arrows+'<path d="m10 11 2-1v5m-2 0h4"/>',sentence:'<path d="M18.5 6a8 8 0 1 0 1.3 10M18.5 2.5V6H15"/><path d="M7 9h9v5h-5l-3 2v-2H7zM9.5 11.5h4"/>',off:'<path d="M4 6h1m3 0h12M4 12h1m3 0h8M4 18h1m3 0h7"/><path d="m18 13 4 3-4 3z"/>'};
export function loopIcon(mode:LoopMode){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-loop-icon="'+mode+'">'+paths[mode]+'</svg>';}
