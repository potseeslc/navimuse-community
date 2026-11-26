import test from 'node:test';
import assert from 'node:assert/strict';
import {approvedAddress,xmlValue,transport} from '../scripts/wiim/probe.mjs';
test('WiiM spike accepts only explicit private IPv4 devices',()=>{
 for(const address of ['127.0.0.1','169.254.169.254','8.8.8.8','localhost','192.168.1.142.evil','192.168.1.142:80','::1'])assert.throws(()=>approvedAddress(address));
 assert.equal(approvedAddress('192.168.1.142'),'192.168.1.142');
});
test('WiiM XML rejects entities and does not evaluate returned markup',()=>{
 assert.throws(()=>xmlValue('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><name>&e;</name>','name'));
 assert.equal(xmlValue('<name>A &amp; B &lt;room&gt;</name>','name'),'A & B <room>');
});
test('read-only spike refuses playback and group mutations before any request',async()=>{
 await assert.rejects(transport('192.168.1.142','Play'),/Read-only/);
 await assert.rejects(transport('192.168.1.142','Stop'),/Read-only/);
});
