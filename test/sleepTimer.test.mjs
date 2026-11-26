import test from 'node:test';
import assert from 'node:assert/strict';
import {createSleepTimer,sleepTimerDeadline,sleepTimerLabel} from '../src/sleepTimer.js';
test('absolute sleep deadline expires once even after suspended callbacks',()=>{
 let now=1000,pauses=0;const changes=[];
 const timer=createSleepTimer({now:()=>now,onExpire:()=>pauses++,onChange:value=>changes.push(value)});
 timer.start(15);now=900999;assert.equal(timer.tick(),false);
 now=1000000;assert.equal(timer.tick(),true);assert.equal(timer.tick(),false);assert.equal(pauses,1);assert.equal(timer.deadline,0);
 assert.deepEqual(changes,[901000,0]);
});
test('replacement and cancellation cannot expire the old timer',()=>{
 let now=0,pauses=0;const timer=createSleepTimer({now:()=>now,onExpire:()=>pauses++});
 timer.start(15);now=1000;timer.start(30);now=900000;timer.tick();assert.equal(pauses,0);
 timer.cancel();now=4000000;timer.tick();assert.equal(pauses,0);
 timer.start(15);now+=900000;timer.tick();assert.equal(pauses,1);
});
test('duration validation and countdown rounding',()=>{
 for(const value of [-1,0,NaN,Infinity,'15',16])assert.throws(()=>sleepTimerDeadline(value));
 assert.equal(sleepTimerDeadline(90,100),5400100);
 assert.equal(sleepTimerLabel(60001,0),'1:01');assert.equal(sleepTimerLabel(0,100),'0:00');
});
