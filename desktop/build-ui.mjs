import {copyFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {deflateSync} from 'node:zlib';
mkdirSync('dist/ui',{recursive:true});
copyFileSync('index.html','dist/index.html');
copyFileSync('ui/style.css','dist/ui/style.css');
// Deterministic temporary development icon, replaced by production branding later.
function chunk(type,data){
  const payload=Buffer.concat([Buffer.from(type),data]);let crc=0xffffffff;
  for(const byte of payload){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  const size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(data.length);sum.writeUInt32BE((crc^0xffffffff)>>>0);
  return Buffer.concat([size,payload,sum]);
}
const size=256,header=Buffer.alloc(13);header.writeUInt32BE(size,0);header.writeUInt32BE(size,4);header[8]=8;header[9]=6;
const rows=Buffer.alloc(size*(1+4*size));
for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=y*(1+4*size)+1+x*4;const mark=(x>53&&x<83&&y>52&&y<204)||(x>171&&x<201&&y>52&&y<204)||(x>74&&x<181&&Math.abs(y-(x-10))<19);rows[i]=mark?236:18;rows[i+1]=mark?246:43;rows[i+2]=mark?255:83;rows[i+3]=255;}
const png=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);
mkdirSync('icons',{recursive:true});writeFileSync('icons/icon.png',png);
const ico=Buffer.alloc(22);ico.writeUInt16LE(1,2);ico.writeUInt16LE(1,4);ico.writeUInt16LE(1,10);ico.writeUInt16LE(32,12);ico.writeUInt32LE(png.length,14);ico.writeUInt32LE(22,18);
writeFileSync('icons/icon.ico',Buffer.concat([ico,png]));
