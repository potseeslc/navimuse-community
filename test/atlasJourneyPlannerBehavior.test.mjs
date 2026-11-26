import test from 'node:test';import assert from 'node:assert/strict';import { invalidatedPlannerState, isCurrentAtlasPlan } from '../src/atlasPlannerState.js';
test('Atlas plan generation is the sole authoritative staleness guard',()=>{assert.equal(isCurrentAtlasPlan(2,2),true);assert.equal(isCurrentAtlasPlan(2,3),false)});
test('Atlas planner invalidation always clears planning state',()=>{assert.deepEqual(invalidatedPlannerState(),{planning:false});assert.ok(Object.isFrozen(invalidatedPlannerState()))});
