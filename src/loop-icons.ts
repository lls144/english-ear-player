import type {LoopMode} from './logic';
export const loopNames:Record<LoopMode,string>={all:'主列表循环',one:'单章循环',off:'顺序一次',sentence:'单句循环'};
// Arrow heads end at their own track. The center is reserved for one small mark.
const arrows='<path d="M4 10V9a3 3 0 0 1 3-3h13m-3-3 3 3-3 3M20 14v1a3 3 0 0 1-3 3H4m3 3-3-3 3-3"/>';
const paths:Record<LoopMode,string>={all:arrows,one:arrows+'<path d="m10.7 10 1.7-1v6"/>',sentence:arrows+'<path d="M9 12h6"/>',off:'<path d="M4 12h16m-5-5 5 5-5 5"/>'};
export function loopIcon(mode:LoopMode){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-loop-icon="'+mode+'">'+paths[mode]+'</svg>';}
