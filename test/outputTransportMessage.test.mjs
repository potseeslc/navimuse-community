import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {outputTransportMessage} from '../src/wiimPlayback.js';

test('local playback keeps its own status when optional speaker polling fails',()=>{
 const state={checked:true,busy:false,session:null,error:'Load failed'};
 assert.equal(outputTransportMessage(state,''),'');
 assert.equal(outputTransportMessage(state,'Loading track…'),'Loading track…');
 assert.equal(outputTransportMessage(state,'This track could not be loaded.'),'This track could not be loaded.');
});
test('uncertain ownership and remote errors remain visible',()=>{
 assert.equal(outputTransportMessage({checked:false,error:'Check output'},''),'Check output');
 assert.equal(outputTransportMessage({checked:true,busy:true,error:'Transfer failed'},''),'Transfer failed');
 assert.equal(outputTransportMessage({checked:true,session:{notice:'Group changing'},error:''},''),'Group changing');
 assert.equal(outputTransportMessage({checked:true,session:{notice:'Group changing'},error:'Command failed'},''),'Command failed');
});
test('both player surfaces use output-scoped transport status',()=>{
 const source=readFileSync(new URL('../src/main.jsx',import.meta.url),'utf8');
 assert.equal(source.match(/transportMessage=\{outputTransportMessage\(wiimState, transportMessage\)\}/g)?.length,2);
});
