import {execFileSync} from 'node:child_process';
const args=process.argv.slice(2);
execFileSync(process.execPath,['scripts/ios-pilot-icons.mjs'],{stdio:'inherit'});
execFileSync('node_modules/.bin/tauri',['ios','build','--export-method','app-store-connect',...args],{stdio:'inherit'});
if(args.includes('--no-sign')||args.includes('--archive-only')) {
 console.log('Archive only: this is not a verified release IPA. Use export-ios-candidate.py, which verifies the signed export.');
} else {
 execFileSync('python3',['scripts/verify-ios-passkeys.py','src-tauri/gen/apple/build/arm64/NaviMuse.ipa'],{stdio:'inherit'});
}
