import {test} from 'node:test';
import assert from 'node:assert/strict';
import {focusDestination,focusEase,isScrollGesture,shouldReduceEffects} from '../src/lyric-motion.ts';
test('sentence focus uses visible bounds and a quiet upper-middle anchor',()=>{const t=focusDestination(600,120,100,{top:110,bottom:710},2000);assert.ok(Math.abs(t-417.2)<1e-8);assert.equal(focusDestination(50,120,0,{top:100,bottom:400},2000),0);});
test('oversized sentences begin below navigation and the final sentence is document-clamped',()=>{assert.equal(focusDestination(500,700,300,{top:110,bottom:410},2000),682);assert.equal(focusDestination(1900,100,0,{top:100,bottom:500},1200),1200);});
test('focus easing is bounded, monotone, cancellable at any sample and does not overshoot',()=>{let last=0;for(let i=0;i<=100;i++){const at=focusEase(i/100);assert.ok(at>=last&&at<=1);last=at;}assert.equal(focusEase(0),0);assert.equal(focusEase(1),1);assert.equal(focusEase(-2),0);assert.equal(focusEase(2),1);});
test('a scroll gesture does not masquerade as a lyric tap',()=>{assert.equal(isScrollGesture(13,15,10,10),false);assert.equal(isScrollGesture(10,25,10,10),true);});

test('sustained slow frames reduce visual effects but an idle/background gap does not',()=>{assert.equal(shouldReduceEffects([16,16,17,16,15,16,16,16]),false);assert.equal(shouldReduceEffects([55,66,50,80,60,51,16,16]),true);assert.equal(shouldReduceEffects([1000,1000,16,16,16,16,16,16]),false);});
