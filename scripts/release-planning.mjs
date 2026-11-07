export function releaseVersion(current, tags, requested) {
 const stable=/^v?(\d+)\.(\d+)\.(\d+)$/;
 const versions=[current,...tags].map(v=>stable.exec(v)).filter(Boolean).map(m=>m.slice(1).map(Number));
 if(requested){
  if(!/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/.test(requested))throw Error('Invalid release version');
  if(tags.includes('v'+requested))throw Error('Version already released; select a new version');
  return requested;
 }
 if(!versions.length)throw Error('A stable base version is required');
 versions.sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);
 const [major,minor,patch]=versions.at(-1);return [major,minor,patch+1].join('.');
}
