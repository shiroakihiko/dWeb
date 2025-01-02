!function t(e,r,n){function o(u,f){if(!r[u]){if(!e[u]){var a="function"==typeof require&&require;if(!f&&a)return a(u,!0);if(i)return i(u,!0);var s=new Error("Cannot find module '"+u+"'");throw s.code="MODULE_NOT_FOUND",s}var h=r[u]={exports:{}};e[u][0].call(h.exports,(function(t){return o(e[u][1][t]||t)}),h,h.exports,t,e,r,n)}return r[u].exports}for(var i="function"==typeof require&&require,u=0;u<n.length;u++)o(n[u]);return o}({1:[function(t,e,r){"use strict";var n=this&&this.__createBinding||(Object.create?function(t,e,r,n){void 0===n&&(n=r),Object.defineProperty(t,n,{enumerable:!0,get:function(){return e[r]}})}:function(t,e,r,n){void 0===n&&(n=r),t[n]=e[r]}),o=this&&this.__setModuleDefault||(Object.create?function(t,e){Object.defineProperty(t,"default",{enumerable:!0,value:e})}:function(t,e){t.default=e}),i=this&&this.__importStar||function(t){if(t&&t.__esModule)return t;var e={};if(null!=t)for(var r in t)"default"!==r&&Object.prototype.hasOwnProperty.call(t,r)&&n(e,t,r);return o(e,t),e};Object.defineProperty(r,"__esModule",{value:!0}),r.blake2bHex=r.blake2b=r.blake2bFinal=r.blake2bUpdate=r.blake2bInit=r.blake2bCompress=r.SIGMA82=r.SIGMA8=r.BLAKE2B_IV32=r.B2B_G=r.B2B_GET32=r.ADD64AC=r.ADD64AA=void 0;const u=i(t("./util"));function f(t,e,r){var n=t[e]+t[r],o=t[e+1]+t[r+1];return n>=4294967296&&o++,t[e]=n,t[e+1]=o,t}function a(t,e,r,n){var o=t[e]+r;r<0&&(o+=4294967296);var i=t[e+1]+n;return o>=4294967296&&i++,t[e]=o,t[e+1]=i,t}function s(t,e){return t[e]^t[e+1]<<8^t[e+2]<<16^t[e+3]<<24}function h(t,e,r,n,o,i){var u=l[o],s=l[o+1],h=l[i],p=l[i+1];f(c,t,e),a(c,t,u,s);var y=c[n]^c[t],g=c[n+1]^c[t+1];c[n]=g,c[n+1]=y,f(c,r,n),y=c[e]^c[r],g=c[e+1]^c[r+1],c[e]=y>>>24^g<<8,c[e+1]=g>>>24^y<<8,f(c,t,e),a(c,t,h,p),y=c[n]^c[t],g=c[n+1]^c[t+1],c[n]=y>>>16^g<<16,c[n+1]=g>>>16^y<<16,f(c,r,n),y=c[e]^c[r],g=c[e+1]^c[r+1],c[e]=g>>>31^y<<1,c[e+1]=y>>>31^g<<1}r.ADD64AA=f,r.ADD64AC=a,r.B2B_GET32=s,r.B2B_G=h,r.BLAKE2B_IV32=new Uint32Array([4089235720,1779033703,2227873595,3144134277,4271175723,1013904242,1595750129,2773480762,2917565137,1359893119,725511199,2600822924,4215389547,528734635,327033209,1541459225]),r.SIGMA8=[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,14,10,4,8,9,15,13,6,1,12,0,2,11,7,5,3,11,8,12,0,5,2,15,13,10,14,3,6,7,1,9,4,7,9,3,1,13,12,11,14,2,6,5,10,4,0,15,8,9,0,5,7,2,4,10,15,14,1,11,12,6,8,3,13,2,12,6,10,0,11,8,3,4,13,7,5,15,14,1,9,12,5,1,15,14,13,4,10,0,7,6,3,9,2,8,11,13,11,7,14,12,1,3,9,5,0,15,4,8,6,2,10,6,15,14,9,11,3,0,8,12,2,13,7,1,4,10,5,10,2,8,4,7,6,1,5,15,11,9,14,3,12,13,0,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,14,10,4,8,9,15,13,6,1,12,0,2,11,7,5,3],r.SIGMA82=new Uint8Array(r.SIGMA8.map((function(t){return 2*t})));const c=new Uint32Array(32),l=new Uint32Array(32);function p(t,e){var n=0;for(n=0;n<16;n++)c[n]=t.h[n],c[n+16]=r.BLAKE2B_IV32[n];for(c[24]=c[24]^t.t,c[25]=c[25]^t.t/4294967296,e&&(c[28]=~c[28],c[29]=~c[29]),n=0;n<32;n++)l[n]=s(t.b,4*n);for(n=0;n<12;n++)h(0,8,16,24,r.SIGMA82[16*n+0],r.SIGMA82[16*n+1]),h(2,10,18,26,r.SIGMA82[16*n+2],r.SIGMA82[16*n+3]),h(4,12,20,28,r.SIGMA82[16*n+4],r.SIGMA82[16*n+5]),h(6,14,22,30,r.SIGMA82[16*n+6],r.SIGMA82[16*n+7]),h(0,10,20,30,r.SIGMA82[16*n+8],r.SIGMA82[16*n+9]),h(2,12,22,24,r.SIGMA82[16*n+10],r.SIGMA82[16*n+11]),h(4,14,16,26,r.SIGMA82[16*n+12],r.SIGMA82[16*n+13]),h(6,8,18,28,r.SIGMA82[16*n+14],r.SIGMA82[16*n+15]);for(n=0;n<16;n++)t.h[n]=t.h[n]^c[n]^c[n+16]}function y(t=64,e){(t<=0||t>64)&&(t=64);for(var n={b:new Uint8Array(128),h:new Uint32Array(16),t:0,c:0,outlen:t},o=0;o<16;o++)n.h[o]=r.BLAKE2B_IV32[o];var i=e?e.length:0;return n.h[0]^=16842752^i<<8^t,e&&(g(n,e),n.c=128),n}function g(t,e){for(var r=0;r<e.length;r++)128===t.c&&(t.t+=t.c,p(t,!1),t.c=0),t.b[t.c++]=e[r]}function d(t){for(t.t+=t.c;t.c<128;)t.b[t.c++]=0;p(t,!0);for(var e=new Uint8Array(t.outlen),r=0;r<t.outlen;r++)e[r]=t.h[r>>2]>>8*(3&r);return e}function b(t,e,r=64){r=r||64,t=u.normalizeInput(t);var n=y(r,e);return g(n,t),d(n)}r.blake2bCompress=p,r.blake2bInit=y,r.blake2bUpdate=g,r.blake2bFinal=d,r.blake2b=b,r.blake2bHex=function(t,e,r=64){var n=b(t,e,r);return u.toHex(n)}},{"./util":4}],2:[function(t,e,r){"use strict";var n=this&&this.__createBinding||(Object.create?function(t,e,r,n){void 0===n&&(n=r),Object.defineProperty(t,n,{enumerable:!0,get:function(){return e[r]}})}:function(t,e,r,n){void 0===n&&(n=r),t[n]=e[r]}),o=this&&this.__setModuleDefault||(Object.create?function(t,e){Object.defineProperty(t,"default",{enumerable:!0,value:e})}:function(t,e){t.default=e}),i=this&&this.__importStar||function(t){if(t&&t.__esModule)return t;var e={};if(null!=t)for(var r in t)"default"!==r&&Object.prototype.hasOwnProperty.call(t,r)&&n(e,t,r);return o(e,t),e};Object.defineProperty(r,"__esModule",{value:!0}),r.blake2sHex=r.blake2s=r.blake2sFinal=r.blake2sUpdate=r.blake2sInit=r.blake2sCompress=r.SIGMA=r.BLAKE2S_IV=r.ROTR32=r.B2S_G=r.B2S_GET32=void 0;const u=i(t("./util"));function f(t,e){return t[e]^t[e+1]<<8^t[e+2]<<16^t[e+3]<<24}function a(t,e,r,n,o,i){h[t]=h[t]+h[e]+o,h[n]=s(h[n]^h[t],16),h[r]=h[r]+h[n],h[e]=s(h[e]^h[r],12),h[t]=h[t]+h[e]+i,h[n]=s(h[n]^h[t],8),h[r]=h[r]+h[n],h[e]=s(h[e]^h[r],7)}function s(t,e){return t>>>e^t<<32-e}r.B2S_GET32=f,r.B2S_G=a,r.ROTR32=s,r.BLAKE2S_IV=new Uint32Array([1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225]),r.SIGMA=new Uint8Array([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,14,10,4,8,9,15,13,6,1,12,0,2,11,7,5,3,11,8,12,0,5,2,15,13,10,14,3,6,7,1,9,4,7,9,3,1,13,12,11,14,2,6,5,10,4,0,15,8,9,0,5,7,2,4,10,15,14,1,11,12,6,8,3,13,2,12,6,10,0,11,8,3,4,13,7,5,15,14,1,9,12,5,1,15,14,13,4,10,0,7,6,3,9,2,8,11,13,11,7,14,12,1,3,9,5,0,15,4,8,6,2,10,6,15,14,9,11,3,0,8,12,2,13,7,1,4,10,5,10,2,8,4,7,6,1,5,15,11,9,14,3,12,13,0]);const h=new Uint32Array(16),c=new Uint32Array(16);function l(t,e){var n=0;for(n=0;n<8;n++)h[n]=t.h[n],h[n+8]=r.BLAKE2S_IV[n];for(h[12]^=t.t,h[13]^=t.t/4294967296,e&&(h[14]=~h[14]),n=0;n<16;n++)c[n]=f(t.b,4*n);for(n=0;n<10;n++)a(0,4,8,12,c[r.SIGMA[16*n+0]],c[r.SIGMA[16*n+1]]),a(1,5,9,13,c[r.SIGMA[16*n+2]],c[r.SIGMA[16*n+3]]),a(2,6,10,14,c[r.SIGMA[16*n+4]],c[r.SIGMA[16*n+5]]),a(3,7,11,15,c[r.SIGMA[16*n+6]],c[r.SIGMA[16*n+7]]),a(0,5,10,15,c[r.SIGMA[16*n+8]],c[r.SIGMA[16*n+9]]),a(1,6,11,12,c[r.SIGMA[16*n+10]],c[r.SIGMA[16*n+11]]),a(2,7,8,13,c[r.SIGMA[16*n+12]],c[r.SIGMA[16*n+13]]),a(3,4,9,14,c[r.SIGMA[16*n+14]],c[r.SIGMA[16*n+15]]);for(n=0;n<8;n++)t.h[n]^=h[n]^h[n+8]}function p(t,e){t>0&&t<=32||(t=32);const n=e?e.length:0;var o={h:new Uint32Array(r.BLAKE2S_IV),b:new Uint8Array(64),c:0,t:0,outlen:t};return o.h[0]^=16842752^n<<8^t,e&&n&&(y(o,e),o.c=64),o}function y(t,e){for(var r=0;r<e.length;r++)64===t.c&&(t.t+=t.c,l(t,!1),t.c=0),t.b[t.c++]=e[r]}function g(t){for(t.t+=t.c;t.c<64;)t.b[t.c++]=0;l(t,!0);for(var e=new Uint8Array(t.outlen),r=0;r<t.outlen;r++)e[r]=t.h[r>>2]>>8*(3&r)&255;return e}function d(t,e,r){r=r||32,t=u.normalizeInput(t);var n=p(r,e);return y(n,t),g(n)}r.blake2sCompress=l,r.blake2sInit=p,r.blake2sUpdate=y,r.blake2sFinal=g,r.blake2s=d,r.blake2sHex=function(t,e,r){var n=d(t,e,r);return u.toHex(n)}},{"./util":4}],3:[function(t,e,r){"use strict";var n=this&&this.__createBinding||(Object.create?function(t,e,r,n){void 0===n&&(n=r),Object.defineProperty(t,n,{enumerable:!0,get:function(){return e[r]}})}:function(t,e,r,n){void 0===n&&(n=r),t[n]=e[r]}),o=this&&this.__setModuleDefault||(Object.create?function(t,e){Object.defineProperty(t,"default",{enumerable:!0,value:e})}:function(t,e){t.default=e}),i=this&&this.__exportStar||function(t,e){for(var r in t)"default"===r||Object.prototype.hasOwnProperty.call(e,r)||n(e,t,r)},u=this&&this.__importStar||function(t){if(t&&t.__esModule)return t;var e={};if(null!=t)for(var r in t)"default"!==r&&Object.prototype.hasOwnProperty.call(t,r)&&n(e,t,r);return o(e,t),e};Object.defineProperty(r,"__esModule",{value:!0}),r.util=void 0,i(t("./blake2b"),r),i(t("./blake2s"),r),r.util=u(t("./util"))},{"./blake2b":1,"./blake2s":2,"./util":4}],4:[function(t,e,r){(function(e){(function(){"use strict";Object.defineProperty(r,"__esModule",{value:!0}),r.testSpeed=r.debugPrint=r.uint32ToHex=r.toHex=r.normalizeInput=void 0;const n=t("doge-json/lib/encode");function o(t){return(4294967296+t).toString(16).substring(1)}r.normalizeInput=function t(r){return"object"!=typeof r?new Uint8Array(e.from(`${r}`)):"buffer"in r?r instanceof Uint8Array?r:new Uint8Array(r.buffer):t(n.encode(r))},r.toHex=function(t){return Array.prototype.map.call(t,(function(t){return(t<16?"0":"")+t.toString(16)})).join("")},r.uint32ToHex=o,r.debugPrint=function(t,e,r){for(var n="\n"+t+" = ",i=0;i<e.length;i+=2){if(32===r)n+=o(e[i]).toUpperCase(),n+=" ",n+=o(e[i+1]).toUpperCase();else{if(64!==r)throw new Error("Invalid size "+r);n+=o(e[i+1]).toUpperCase(),n+=o(e[i]).toUpperCase()}i%6==4?n+="\n"+new Array(t.length+4).join(" "):i<e.length-2&&(n+=" ")}console.log(n)},r.testSpeed=function(t,e,r){for(var n=(new Date).getTime(),o=new Uint8Array(e),i=0;i<e;i++)o[i]=i%256;var u=(new Date).getTime();for(console.log("Generated random input in "+(u-n)+"ms"),n=u,i=0;i<r;i++){var f=t(o),a=(new Date).getTime(),s=a-n;n=a,console.log("Hashed in "+s+"ms: "+f.substring(0,20)+"..."),console.log(Math.round(e/(1<<20)/(s/1e3)*100)/100+" MB PER SECOND")}}}).call(this)}).call(this,t("buffer").Buffer)},{buffer:11,"doge-json/lib/encode":6}],5:[function(t,e,r){"use strict";function n(t){try{return JSON.parse(t)}catch(e){return t}}Object.defineProperty(r,"__esModule",{value:!0}),r.decode=void 0,r.decode=n,r.default=n,e.exports=n,Object.assign(n,{default:n,decode:n})},{}],6:[function(t,e,r){"use strict";Object.defineProperty(r,"__esModule",{value:!0}),r.encode=void 0;const n=t("./normalize-object"),o=t("./transforms");function i(t){return t instanceof Map?i(o.map(t)):t instanceof Set?i(o.set(t)):"boolean"==typeof t||"number"==typeof t||"bigint"==typeof t?`${t}`:"string"==typeof t||"symbol"==typeof t||"function"==typeof t?JSON.stringify(t.toString()):t&&"object"==typeof t?JSON.stringify(n.normalize_object(t),null,"\t")+"\n":"null"}r.encode=i,r.default=i,e.exports=i,Object.assign(i,{default:i,encode:i})},{"./normalize-object":7,"./transforms":8}],7:[function(t,e,r){"use strict";Object.defineProperty(r,"__esModule",{value:!0}),r.normalize_object=void 0;const n=t("./decode"),o=t("./encode");function i(t,e){if(e||(e=[]),t instanceof Array)return t.map((t=>"object"==typeof t?i(t):n.decode(o.encode(t))));{const r={};for(const[u,f]of Object.entries(t))"object"==typeof f?e.includes(f)?r[u]="<< RECURSION >>":(e.push(f),r[u]=i(f,e),e.pop()):r[u]=n.decode(o.encode(f));return r}}r.normalize_object=i,r.default=i,e.exports=i,Object.assign(i,{default:i,normalize_object:i})},{"./decode":5,"./encode":6}],8:[function(t,e,r){"use strict";Object.defineProperty(r,"__esModule",{value:!0}),r.set=r.map=void 0,r.map=function(t){const e={};for(const[r,n]of t.entries())e[r]=n;return e},r.set=function(t){return[...t]}},{}],9:[function(t,e,r){Object.assign(window,t("blakets"))},{blakets:3}],10:[function(t,e,r){"use strict";r.byteLength=function(t){var e=s(t),r=e[0],n=e[1];return 3*(r+n)/4-n},r.toByteArray=function(t){var e,r,n=s(t),u=n[0],f=n[1],a=new i(function(t,e,r){return 3*(e+r)/4-r}(0,u,f)),h=0,c=f>0?u-4:u;for(r=0;r<c;r+=4)e=o[t.charCodeAt(r)]<<18|o[t.charCodeAt(r+1)]<<12|o[t.charCodeAt(r+2)]<<6|o[t.charCodeAt(r+3)],a[h++]=e>>16&255,a[h++]=e>>8&255,a[h++]=255&e;2===f&&(e=o[t.charCodeAt(r)]<<2|o[t.charCodeAt(r+1)]>>4,a[h++]=255&e);1===f&&(e=o[t.charCodeAt(r)]<<10|o[t.charCodeAt(r+1)]<<4|o[t.charCodeAt(r+2)]>>2,a[h++]=e>>8&255,a[h++]=255&e);return a},r.fromByteArray=function(t){for(var e,r=t.length,o=r%3,i=[],u=16383,f=0,a=r-o;f<a;f+=u)i.push(h(t,f,f+u>a?a:f+u));1===o?(e=t[r-1],i.push(n[e>>2]+n[e<<4&63]+"==")):2===o&&(e=(t[r-2]<<8)+t[r-1],i.push(n[e>>10]+n[e>>4&63]+n[e<<2&63]+"="));return i.join("")};for(var n=[],o=[],i="undefined"!=typeof Uint8Array?Uint8Array:Array,u="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",f=0,a=u.length;f<a;++f)n[f]=u[f],o[u.charCodeAt(f)]=f;function s(t){var e=t.length;if(e%4>0)throw new Error("Invalid string. Length must be a multiple of 4");var r=t.indexOf("=");return-1===r&&(r=e),[r,r===e?0:4-r%4]}function h(t,e,r){for(var o,i,u=[],f=e;f<r;f+=3)o=(t[f]<<16&16711680)+(t[f+1]<<8&65280)+(255&t[f+2]),u.push(n[(i=o)>>18&63]+n[i>>12&63]+n[i>>6&63]+n[63&i]);return u.join("")}o["-".charCodeAt(0)]=62,o["_".charCodeAt(0)]=63},{}],11:[function(t,e,r){(function(e){(function(){
/*!
 * The buffer module from node.js, for the browser.
 *
 * @author   Feross Aboukhadijeh <https://feross.org>
 * @license  MIT
 */
"use strict";var e=t("base64-js"),n=t("ieee754");r.Buffer=u,r.SlowBuffer=function(t){+t!=t&&(t=0);return u.alloc(+t)},r.INSPECT_MAX_BYTES=50;var o=2147483647;function i(t){if(t>o)throw new RangeError('The value "'+t+'" is invalid for option "size"');var e=new Uint8Array(t);return e.__proto__=u.prototype,e}function u(t,e,r){if("number"==typeof t){if("string"==typeof e)throw new TypeError('The "string" argument must be of type string. Received type number');return s(t)}return f(t,e,r)}function f(t,e,r){if("string"==typeof t)return function(t,e){"string"==typeof e&&""!==e||(e="utf8");if(!u.isEncoding(e))throw new TypeError("Unknown encoding: "+e);var r=0|l(t,e),n=i(r),o=n.write(t,e);o!==r&&(n=n.slice(0,o));return n}(t,e);if(ArrayBuffer.isView(t))return h(t);if(null==t)throw TypeError("The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type "+typeof t);if(z(t,ArrayBuffer)||t&&z(t.buffer,ArrayBuffer))return function(t,e,r){if(e<0||t.byteLength<e)throw new RangeError('"offset" is outside of buffer bounds');if(t.byteLength<e+(r||0))throw new RangeError('"length" is outside of buffer bounds');var n;n=void 0===e&&void 0===r?new Uint8Array(t):void 0===r?new Uint8Array(t,e):new Uint8Array(t,e,r);return n.__proto__=u.prototype,n}(t,e,r);if("number"==typeof t)throw new TypeError('The "value" argument must not be of type number. Received type number');var n=t.valueOf&&t.valueOf();if(null!=n&&n!==t)return u.from(n,e,r);var o=function(t){if(u.isBuffer(t)){var e=0|c(t.length),r=i(e);return 0===r.length||t.copy(r,0,0,e),r}if(void 0!==t.length)return"number"!=typeof t.length||N(t.length)?i(0):h(t);if("Buffer"===t.type&&Array.isArray(t.data))return h(t.data)}(t);if(o)return o;if("undefined"!=typeof Symbol&&null!=Symbol.toPrimitive&&"function"==typeof t[Symbol.toPrimitive])return u.from(t[Symbol.toPrimitive]("string"),e,r);throw new TypeError("The first argument must be one of type string, Buffer, ArrayBuffer, Array, or Array-like Object. Received type "+typeof t)}function a(t){if("number"!=typeof t)throw new TypeError('"size" argument must be of type number');if(t<0)throw new RangeError('The value "'+t+'" is invalid for option "size"')}function s(t){return a(t),i(t<0?0:0|c(t))}function h(t){for(var e=t.length<0?0:0|c(t.length),r=i(e),n=0;n<e;n+=1)r[n]=255&t[n];return r}function c(t){if(t>=o)throw new RangeError("Attempt to allocate Buffer larger than maximum size: 0x"+o.toString(16)+" bytes");return 0|t}function l(t,e){if(u.isBuffer(t))return t.length;if(ArrayBuffer.isView(t)||z(t,ArrayBuffer))return t.byteLength;if("string"!=typeof t)throw new TypeError('The "string" argument must be one of type string, Buffer, or ArrayBuffer. Received type '+typeof t);var r=t.length,n=arguments.length>2&&!0===arguments[2];if(!n&&0===r)return 0;for(var o=!1;;)switch(e){case"ascii":case"latin1":case"binary":return r;case"utf8":case"utf-8":return R(t).length;case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":return 2*r;case"hex":return r>>>1;case"base64":return P(t).length;default:if(o)return n?-1:R(t).length;e=(""+e).toLowerCase(),o=!0}}function p(t,e,r){var n=!1;if((void 0===e||e<0)&&(e=0),e>this.length)return"";if((void 0===r||r>this.length)&&(r=this.length),r<=0)return"";if((r>>>=0)<=(e>>>=0))return"";for(t||(t="utf8");;)switch(t){case"hex":return U(this,e,r);case"utf8":case"utf-8":return B(this,e,r);case"ascii":return S(this,e,r);case"latin1":case"binary":return M(this,e,r);case"base64":return _(this,e,r);case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":return O(this,e,r);default:if(n)throw new TypeError("Unknown encoding: "+t);t=(t+"").toLowerCase(),n=!0}}function y(t,e,r){var n=t[e];t[e]=t[r],t[r]=n}function g(t,e,r,n,o){if(0===t.length)return-1;if("string"==typeof r?(n=r,r=0):r>2147483647?r=2147483647:r<-2147483648&&(r=-2147483648),N(r=+r)&&(r=o?0:t.length-1),r<0&&(r=t.length+r),r>=t.length){if(o)return-1;r=t.length-1}else if(r<0){if(!o)return-1;r=0}if("string"==typeof e&&(e=u.from(e,n)),u.isBuffer(e))return 0===e.length?-1:d(t,e,r,n,o);if("number"==typeof e)return e&=255,"function"==typeof Uint8Array.prototype.indexOf?o?Uint8Array.prototype.indexOf.call(t,e,r):Uint8Array.prototype.lastIndexOf.call(t,e,r):d(t,[e],r,n,o);throw new TypeError("val must be string, number or Buffer")}function d(t,e,r,n,o){var i,u=1,f=t.length,a=e.length;if(void 0!==n&&("ucs2"===(n=String(n).toLowerCase())||"ucs-2"===n||"utf16le"===n||"utf-16le"===n)){if(t.length<2||e.length<2)return-1;u=2,f/=2,a/=2,r/=2}function s(t,e){return 1===u?t[e]:t.readUInt16BE(e*u)}if(o){var h=-1;for(i=r;i<f;i++)if(s(t,i)===s(e,-1===h?0:i-h)){if(-1===h&&(h=i),i-h+1===a)return h*u}else-1!==h&&(i-=i-h),h=-1}else for(r+a>f&&(r=f-a),i=r;i>=0;i--){for(var c=!0,l=0;l<a;l++)if(s(t,i+l)!==s(e,l)){c=!1;break}if(c)return i}return-1}function b(t,e,r,n){r=Number(r)||0;var o=t.length-r;n?(n=Number(n))>o&&(n=o):n=o;var i=e.length;n>i/2&&(n=i/2);for(var u=0;u<n;++u){var f=parseInt(e.substr(2*u,2),16);if(N(f))return u;t[r+u]=f}return u}function v(t,e,r,n){return D(R(e,t.length-r),t,r,n)}function w(t,e,r,n){return D(function(t){for(var e=[],r=0;r<t.length;++r)e.push(255&t.charCodeAt(r));return e}(e),t,r,n)}function A(t,e,r,n){return w(t,e,r,n)}function m(t,e,r,n){return D(P(e),t,r,n)}function E(t,e,r,n){return D(function(t,e){for(var r,n,o,i=[],u=0;u<t.length&&!((e-=2)<0);++u)n=(r=t.charCodeAt(u))>>8,o=r%256,i.push(o),i.push(n);return i}(e,t.length-r),t,r,n)}function _(t,r,n){return 0===r&&n===t.length?e.fromByteArray(t):e.fromByteArray(t.slice(r,n))}function B(t,e,r){r=Math.min(t.length,r);for(var n=[],o=e;o<r;){var i,u,f,a,s=t[o],h=null,c=s>239?4:s>223?3:s>191?2:1;if(o+c<=r)switch(c){case 1:s<128&&(h=s);break;case 2:128==(192&(i=t[o+1]))&&(a=(31&s)<<6|63&i)>127&&(h=a);break;case 3:i=t[o+1],u=t[o+2],128==(192&i)&&128==(192&u)&&(a=(15&s)<<12|(63&i)<<6|63&u)>2047&&(a<55296||a>57343)&&(h=a);break;case 4:i=t[o+1],u=t[o+2],f=t[o+3],128==(192&i)&&128==(192&u)&&128==(192&f)&&(a=(15&s)<<18|(63&i)<<12|(63&u)<<6|63&f)>65535&&a<1114112&&(h=a)}null===h?(h=65533,c=1):h>65535&&(h-=65536,n.push(h>>>10&1023|55296),h=56320|1023&h),n.push(h),o+=c}return function(t){var e=t.length;if(e<=I)return String.fromCharCode.apply(String,t);var r="",n=0;for(;n<e;)r+=String.fromCharCode.apply(String,t.slice(n,n+=I));return r}(n)}r.kMaxLength=o,u.TYPED_ARRAY_SUPPORT=function(){try{var t=new Uint8Array(1);return t.__proto__={__proto__:Uint8Array.prototype,foo:function(){return 42}},42===t.foo()}catch(t){return!1}}(),u.TYPED_ARRAY_SUPPORT||"undefined"==typeof console||"function"!=typeof console.error||console.error("This browser lacks typed array (Uint8Array) support which is required by `buffer` v5.x. Use `buffer` v4.x if you require old browser support."),Object.defineProperty(u.prototype,"parent",{enumerable:!0,get:function(){if(u.isBuffer(this))return this.buffer}}),Object.defineProperty(u.prototype,"offset",{enumerable:!0,get:function(){if(u.isBuffer(this))return this.byteOffset}}),"undefined"!=typeof Symbol&&null!=Symbol.species&&u[Symbol.species]===u&&Object.defineProperty(u,Symbol.species,{value:null,configurable:!0,enumerable:!1,writable:!1}),u.poolSize=8192,u.from=function(t,e,r){return f(t,e,r)},u.prototype.__proto__=Uint8Array.prototype,u.__proto__=Uint8Array,u.alloc=function(t,e,r){return function(t,e,r){return a(t),t<=0?i(t):void 0!==e?"string"==typeof r?i(t).fill(e,r):i(t).fill(e):i(t)}(t,e,r)},u.allocUnsafe=function(t){return s(t)},u.allocUnsafeSlow=function(t){return s(t)},u.isBuffer=function(t){return null!=t&&!0===t._isBuffer&&t!==u.prototype},u.compare=function(t,e){if(z(t,Uint8Array)&&(t=u.from(t,t.offset,t.byteLength)),z(e,Uint8Array)&&(e=u.from(e,e.offset,e.byteLength)),!u.isBuffer(t)||!u.isBuffer(e))throw new TypeError('The "buf1", "buf2" arguments must be one of type Buffer or Uint8Array');if(t===e)return 0;for(var r=t.length,n=e.length,o=0,i=Math.min(r,n);o<i;++o)if(t[o]!==e[o]){r=t[o],n=e[o];break}return r<n?-1:n<r?1:0},u.isEncoding=function(t){switch(String(t).toLowerCase()){case"hex":case"utf8":case"utf-8":case"ascii":case"latin1":case"binary":case"base64":case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":return!0;default:return!1}},u.concat=function(t,e){if(!Array.isArray(t))throw new TypeError('"list" argument must be an Array of Buffers');if(0===t.length)return u.alloc(0);var r;if(void 0===e)for(e=0,r=0;r<t.length;++r)e+=t[r].length;var n=u.allocUnsafe(e),o=0;for(r=0;r<t.length;++r){var i=t[r];if(z(i,Uint8Array)&&(i=u.from(i)),!u.isBuffer(i))throw new TypeError('"list" argument must be an Array of Buffers');i.copy(n,o),o+=i.length}return n},u.byteLength=l,u.prototype._isBuffer=!0,u.prototype.swap16=function(){var t=this.length;if(t%2!=0)throw new RangeError("Buffer size must be a multiple of 16-bits");for(var e=0;e<t;e+=2)y(this,e,e+1);return this},u.prototype.swap32=function(){var t=this.length;if(t%4!=0)throw new RangeError("Buffer size must be a multiple of 32-bits");for(var e=0;e<t;e+=4)y(this,e,e+3),y(this,e+1,e+2);return this},u.prototype.swap64=function(){var t=this.length;if(t%8!=0)throw new RangeError("Buffer size must be a multiple of 64-bits");for(var e=0;e<t;e+=8)y(this,e,e+7),y(this,e+1,e+6),y(this,e+2,e+5),y(this,e+3,e+4);return this},u.prototype.toString=function(){var t=this.length;return 0===t?"":0===arguments.length?B(this,0,t):p.apply(this,arguments)},u.prototype.toLocaleString=u.prototype.toString,u.prototype.equals=function(t){if(!u.isBuffer(t))throw new TypeError("Argument must be a Buffer");return this===t||0===u.compare(this,t)},u.prototype.inspect=function(){var t="",e=r.INSPECT_MAX_BYTES;return t=this.toString("hex",0,e).replace(/(.{2})/g,"$1 ").trim(),this.length>e&&(t+=" ... "),"<Buffer "+t+">"},u.prototype.compare=function(t,e,r,n,o){if(z(t,Uint8Array)&&(t=u.from(t,t.offset,t.byteLength)),!u.isBuffer(t))throw new TypeError('The "target" argument must be one of type Buffer or Uint8Array. Received type '+typeof t);if(void 0===e&&(e=0),void 0===r&&(r=t?t.length:0),void 0===n&&(n=0),void 0===o&&(o=this.length),e<0||r>t.length||n<0||o>this.length)throw new RangeError("out of range index");if(n>=o&&e>=r)return 0;if(n>=o)return-1;if(e>=r)return 1;if(this===t)return 0;for(var i=(o>>>=0)-(n>>>=0),f=(r>>>=0)-(e>>>=0),a=Math.min(i,f),s=this.slice(n,o),h=t.slice(e,r),c=0;c<a;++c)if(s[c]!==h[c]){i=s[c],f=h[c];break}return i<f?-1:f<i?1:0},u.prototype.includes=function(t,e,r){return-1!==this.indexOf(t,e,r)},u.prototype.indexOf=function(t,e,r){return g(this,t,e,r,!0)},u.prototype.lastIndexOf=function(t,e,r){return g(this,t,e,r,!1)},u.prototype.write=function(t,e,r,n){if(void 0===e)n="utf8",r=this.length,e=0;else if(void 0===r&&"string"==typeof e)n=e,r=this.length,e=0;else{if(!isFinite(e))throw new Error("Buffer.write(string, encoding, offset[, length]) is no longer supported");e>>>=0,isFinite(r)?(r>>>=0,void 0===n&&(n="utf8")):(n=r,r=void 0)}var o=this.length-e;if((void 0===r||r>o)&&(r=o),t.length>0&&(r<0||e<0)||e>this.length)throw new RangeError("Attempt to write outside buffer bounds");n||(n="utf8");for(var i=!1;;)switch(n){case"hex":return b(this,t,e,r);case"utf8":case"utf-8":return v(this,t,e,r);case"ascii":return w(this,t,e,r);case"latin1":case"binary":return A(this,t,e,r);case"base64":return m(this,t,e,r);case"ucs2":case"ucs-2":case"utf16le":case"utf-16le":return E(this,t,e,r);default:if(i)throw new TypeError("Unknown encoding: "+n);n=(""+n).toLowerCase(),i=!0}},u.prototype.toJSON=function(){return{type:"Buffer",data:Array.prototype.slice.call(this._arr||this,0)}};var I=4096;function S(t,e,r){var n="";r=Math.min(t.length,r);for(var o=e;o<r;++o)n+=String.fromCharCode(127&t[o]);return n}function M(t,e,r){var n="";r=Math.min(t.length,r);for(var o=e;o<r;++o)n+=String.fromCharCode(t[o]);return n}function U(t,e,r){var n=t.length;(!e||e<0)&&(e=0),(!r||r<0||r>n)&&(r=n);for(var o="",i=e;i<r;++i)o+=x(t[i]);return o}function O(t,e,r){for(var n=t.slice(e,r),o="",i=0;i<n.length;i+=2)o+=String.fromCharCode(n[i]+256*n[i+1]);return o}function j(t,e,r){if(t%1!=0||t<0)throw new RangeError("offset is not uint");if(t+e>r)throw new RangeError("Trying to access beyond buffer length")}function T(t,e,r,n,o,i){if(!u.isBuffer(t))throw new TypeError('"buffer" argument must be a Buffer instance');if(e>o||e<i)throw new RangeError('"value" argument is out of bounds');if(r+n>t.length)throw new RangeError("Index out of range")}function k(t,e,r,n,o,i){if(r+n>t.length)throw new RangeError("Index out of range");if(r<0)throw new RangeError("Index out of range")}function G(t,e,r,o,i){return e=+e,r>>>=0,i||k(t,0,r,4),n.write(t,e,r,o,23,4),r+4}function C(t,e,r,o,i){return e=+e,r>>>=0,i||k(t,0,r,8),n.write(t,e,r,o,52,8),r+8}u.prototype.slice=function(t,e){var r=this.length;(t=~~t)<0?(t+=r)<0&&(t=0):t>r&&(t=r),(e=void 0===e?r:~~e)<0?(e+=r)<0&&(e=0):e>r&&(e=r),e<t&&(e=t);var n=this.subarray(t,e);return n.__proto__=u.prototype,n},u.prototype.readUIntLE=function(t,e,r){t>>>=0,e>>>=0,r||j(t,e,this.length);for(var n=this[t],o=1,i=0;++i<e&&(o*=256);)n+=this[t+i]*o;return n},u.prototype.readUIntBE=function(t,e,r){t>>>=0,e>>>=0,r||j(t,e,this.length);for(var n=this[t+--e],o=1;e>0&&(o*=256);)n+=this[t+--e]*o;return n},u.prototype.readUInt8=function(t,e){return t>>>=0,e||j(t,1,this.length),this[t]},u.prototype.readUInt16LE=function(t,e){return t>>>=0,e||j(t,2,this.length),this[t]|this[t+1]<<8},u.prototype.readUInt16BE=function(t,e){return t>>>=0,e||j(t,2,this.length),this[t]<<8|this[t+1]},u.prototype.readUInt32LE=function(t,e){return t>>>=0,e||j(t,4,this.length),(this[t]|this[t+1]<<8|this[t+2]<<16)+16777216*this[t+3]},u.prototype.readUInt32BE=function(t,e){return t>>>=0,e||j(t,4,this.length),16777216*this[t]+(this[t+1]<<16|this[t+2]<<8|this[t+3])},u.prototype.readIntLE=function(t,e,r){t>>>=0,e>>>=0,r||j(t,e,this.length);for(var n=this[t],o=1,i=0;++i<e&&(o*=256);)n+=this[t+i]*o;return n>=(o*=128)&&(n-=Math.pow(2,8*e)),n},u.prototype.readIntBE=function(t,e,r){t>>>=0,e>>>=0,r||j(t,e,this.length);for(var n=e,o=1,i=this[t+--n];n>0&&(o*=256);)i+=this[t+--n]*o;return i>=(o*=128)&&(i-=Math.pow(2,8*e)),i},u.prototype.readInt8=function(t,e){return t>>>=0,e||j(t,1,this.length),128&this[t]?-1*(255-this[t]+1):this[t]},u.prototype.readInt16LE=function(t,e){t>>>=0,e||j(t,2,this.length);var r=this[t]|this[t+1]<<8;return 32768&r?4294901760|r:r},u.prototype.readInt16BE=function(t,e){t>>>=0,e||j(t,2,this.length);var r=this[t+1]|this[t]<<8;return 32768&r?4294901760|r:r},u.prototype.readInt32LE=function(t,e){return t>>>=0,e||j(t,4,this.length),this[t]|this[t+1]<<8|this[t+2]<<16|this[t+3]<<24},u.prototype.readInt32BE=function(t,e){return t>>>=0,e||j(t,4,this.length),this[t]<<24|this[t+1]<<16|this[t+2]<<8|this[t+3]},u.prototype.readFloatLE=function(t,e){return t>>>=0,e||j(t,4,this.length),n.read(this,t,!0,23,4)},u.prototype.readFloatBE=function(t,e){return t>>>=0,e||j(t,4,this.length),n.read(this,t,!1,23,4)},u.prototype.readDoubleLE=function(t,e){return t>>>=0,e||j(t,8,this.length),n.read(this,t,!0,52,8)},u.prototype.readDoubleBE=function(t,e){return t>>>=0,e||j(t,8,this.length),n.read(this,t,!1,52,8)},u.prototype.writeUIntLE=function(t,e,r,n){(t=+t,e>>>=0,r>>>=0,n)||T(this,t,e,r,Math.pow(2,8*r)-1,0);var o=1,i=0;for(this[e]=255&t;++i<r&&(o*=256);)this[e+i]=t/o&255;return e+r},u.prototype.writeUIntBE=function(t,e,r,n){(t=+t,e>>>=0,r>>>=0,n)||T(this,t,e,r,Math.pow(2,8*r)-1,0);var o=r-1,i=1;for(this[e+o]=255&t;--o>=0&&(i*=256);)this[e+o]=t/i&255;return e+r},u.prototype.writeUInt8=function(t,e,r){return t=+t,e>>>=0,r||T(this,t,e,1,255,0),this[e]=255&t,e+1},u.prototype.writeUInt16LE=function(t,e,r){return t=+t,e>>>=0,r||T(this,t,e,2,65535,0),this[e]=255&t,this[e+1]=t>>>8,e+2},u.prototype.writeUInt16BE=function(t,e,r){return t=+t,e>>>=0,r||T(this,t,e,2,65535,0),this[e]=t>>>8,this[e+1]=255&t,e+2},u.prototype.writeUInt32LE=function(t,e,r){return t=+t,e>>>=0,r||T(this,t,e,4,4294967295,0),this[e+3]=t>>>24,this[e+2]=t>>>16,this[e+1]=t>>>8,this[e]=255&t,e+4},u.prototype.writeUInt32BE=function(t,e,r){return t=+t,e>>>=0,r||T(this,t,e,4,4294967295,0),this[e]=t>>>24,this[e+1]=t>>>16,this[e+2]=t>>>8,this[e+3]=255&t,e+4},u.prototype.writeIntLE=function(t,e,r,n){if(t=+t,e>>>=0,!n){var o=Math.pow(2,8*r-1);T(this,t,e,r,o-1,-o)}var i=0,u=1,f=0;for(this[e]=255&t;++i<r&&(u*=256);)t<0&&0===f&&0!==this[e+i-1]&&(f=1),this[e+i]=(t/u>>0)-f&255;return e+r},u.prototype.writeIntBE=function(t,e,r,n){if(t=+t,e>>>=0,!n){var o=Math.pow(2,8*r-1);T(this,t,e,r,o-1,-o)}var i=r-1,u=1,f=0;for(this[e+i]=255&t;--i>=0&&(u*=256);)t<0&&0===f&&0!==this[e+i+1]&&(f=1),this[e+i]=(t/u>>0)-f&255;return e+r},u.prototype.writeInt8=function(t,e,r){return t=+t,e>>>=0,r||T(this,t,e,1,127,-128),t<0&&(t=255+t+1),this[e]=255&t,e+1},u.prototype.writeInt16LE=function(t,e,r){return t=+t,e>>>=0,r||T(this,t,e,2,32767,-32768),this[e]=255&t,this[e+1]=t>>>8,e+2},u.prototype.writeInt16BE=function(t,e,r){return t=+t,e>>>=0,r||T(this,t,e,2,32767,-32768),this[e]=t>>>8,this[e+1]=255&t,e+2},u.prototype.writeInt32LE=function(t,e,r){return t=+t,e>>>=0,r||T(this,t,e,4,2147483647,-2147483648),this[e]=255&t,this[e+1]=t>>>8,this[e+2]=t>>>16,this[e+3]=t>>>24,e+4},u.prototype.writeInt32BE=function(t,e,r){return t=+t,e>>>=0,r||T(this,t,e,4,2147483647,-2147483648),t<0&&(t=4294967295+t+1),this[e]=t>>>24,this[e+1]=t>>>16,this[e+2]=t>>>8,this[e+3]=255&t,e+4},u.prototype.writeFloatLE=function(t,e,r){return G(this,t,e,!0,r)},u.prototype.writeFloatBE=function(t,e,r){return G(this,t,e,!1,r)},u.prototype.writeDoubleLE=function(t,e,r){return C(this,t,e,!0,r)},u.prototype.writeDoubleBE=function(t,e,r){return C(this,t,e,!1,r)},u.prototype.copy=function(t,e,r,n){if(!u.isBuffer(t))throw new TypeError("argument should be a Buffer");if(r||(r=0),n||0===n||(n=this.length),e>=t.length&&(e=t.length),e||(e=0),n>0&&n<r&&(n=r),n===r)return 0;if(0===t.length||0===this.length)return 0;if(e<0)throw new RangeError("targetStart out of bounds");if(r<0||r>=this.length)throw new RangeError("Index out of range");if(n<0)throw new RangeError("sourceEnd out of bounds");n>this.length&&(n=this.length),t.length-e<n-r&&(n=t.length-e+r);var o=n-r;if(this===t&&"function"==typeof Uint8Array.prototype.copyWithin)this.copyWithin(e,r,n);else if(this===t&&r<e&&e<n)for(var i=o-1;i>=0;--i)t[i+e]=this[i+r];else Uint8Array.prototype.set.call(t,this.subarray(r,n),e);return o},u.prototype.fill=function(t,e,r,n){if("string"==typeof t){if("string"==typeof e?(n=e,e=0,r=this.length):"string"==typeof r&&(n=r,r=this.length),void 0!==n&&"string"!=typeof n)throw new TypeError("encoding must be a string");if("string"==typeof n&&!u.isEncoding(n))throw new TypeError("Unknown encoding: "+n);if(1===t.length){var o=t.charCodeAt(0);("utf8"===n&&o<128||"latin1"===n)&&(t=o)}}else"number"==typeof t&&(t&=255);if(e<0||this.length<e||this.length<r)throw new RangeError("Out of range index");if(r<=e)return this;var i;if(e>>>=0,r=void 0===r?this.length:r>>>0,t||(t=0),"number"==typeof t)for(i=e;i<r;++i)this[i]=t;else{var f=u.isBuffer(t)?t:u.from(t,n),a=f.length;if(0===a)throw new TypeError('The value "'+t+'" is invalid for argument "value"');for(i=0;i<r-e;++i)this[i+e]=f[i%a]}return this};var L=/[^+/0-9A-Za-z-_]/g;function x(t){return t<16?"0"+t.toString(16):t.toString(16)}function R(t,e){var r;e=e||1/0;for(var n=t.length,o=null,i=[],u=0;u<n;++u){if((r=t.charCodeAt(u))>55295&&r<57344){if(!o){if(r>56319){(e-=3)>-1&&i.push(239,191,189);continue}if(u+1===n){(e-=3)>-1&&i.push(239,191,189);continue}o=r;continue}if(r<56320){(e-=3)>-1&&i.push(239,191,189),o=r;continue}r=65536+(o-55296<<10|r-56320)}else o&&(e-=3)>-1&&i.push(239,191,189);if(o=null,r<128){if((e-=1)<0)break;i.push(r)}else if(r<2048){if((e-=2)<0)break;i.push(r>>6|192,63&r|128)}else if(r<65536){if((e-=3)<0)break;i.push(r>>12|224,r>>6&63|128,63&r|128)}else{if(!(r<1114112))throw new Error("Invalid code point");if((e-=4)<0)break;i.push(r>>18|240,r>>12&63|128,r>>6&63|128,63&r|128)}}return i}function P(t){return e.toByteArray(function(t){if((t=(t=t.split("=")[0]).trim().replace(L,"")).length<2)return"";for(;t.length%4!=0;)t+="=";return t}(t))}function D(t,e,r,n){for(var o=0;o<n&&!(o+r>=e.length||o>=t.length);++o)e[o+r]=t[o];return o}function z(t,e){return t instanceof e||null!=t&&null!=t.constructor&&null!=t.constructor.name&&t.constructor.name===e.name}function N(t){return t!=t}}).call(this)}).call(this,t("buffer").Buffer)},{"base64-js":10,buffer:11,ieee754:12}],12:[function(t,e,r){
/*! ieee754. BSD-3-Clause License. Feross Aboukhadijeh <https://feross.org/opensource> */
r.read=function(t,e,r,n,o){var i,u,f=8*o-n-1,a=(1<<f)-1,s=a>>1,h=-7,c=r?o-1:0,l=r?-1:1,p=t[e+c];for(c+=l,i=p&(1<<-h)-1,p>>=-h,h+=f;h>0;i=256*i+t[e+c],c+=l,h-=8);for(u=i&(1<<-h)-1,i>>=-h,h+=n;h>0;u=256*u+t[e+c],c+=l,h-=8);if(0===i)i=1-s;else{if(i===a)return u?NaN:1/0*(p?-1:1);u+=Math.pow(2,n),i-=s}return(p?-1:1)*u*Math.pow(2,i-n)},r.write=function(t,e,r,n,o,i){var u,f,a,s=8*i-o-1,h=(1<<s)-1,c=h>>1,l=23===o?Math.pow(2,-24)-Math.pow(2,-77):0,p=n?0:i-1,y=n?1:-1,g=e<0||0===e&&1/e<0?1:0;for(e=Math.abs(e),isNaN(e)||e===1/0?(f=isNaN(e)?1:0,u=h):(u=Math.floor(Math.log(e)/Math.LN2),e*(a=Math.pow(2,-u))<1&&(u--,a*=2),(e+=u+c>=1?l/a:l*Math.pow(2,1-c))*a>=2&&(u++,a/=2),u+c>=h?(f=0,u=h):u+c>=1?(f=(e*a-1)*Math.pow(2,o),u+=c):(f=e*Math.pow(2,c-1)*Math.pow(2,o),u=0));o>=8;t[r+p]=255&f,p+=y,f/=256,o-=8);for(u=u<<o|f,s+=o;s>0;t[r+p]=255&u,p+=y,u/=256,s-=8);t[r+p-y]|=128*g}},{}]},{},[9]);