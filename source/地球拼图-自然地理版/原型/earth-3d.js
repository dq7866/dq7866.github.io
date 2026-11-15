/* 地球知识 · 内部圈层 3D 渲染器（自包含，零依赖，离线）
 * 不依赖 Three.js / GlobePuzzle，纯 WebGL 实现，专业剖切可视化：
 *   - 真实比例四层：地壳（极薄带）/ 地幔（主体）/ 外核 / 内核（真实半径比例，已标注为夸张薄壳）；
 *   - 90° 楔形切口 + 两个同心环剖面圆盘，呈现「把地球切开」的教科书式剖面；
 *   - 菲涅尔大气辉光、核部自发光脉动、方向光 + 环境光真实打光；
 *   - 各层中文浮标（HTML 投影标签，含深度）+ 三个地震不连续面（莫霍/古登堡/莱曼）标注；
 *   - 「拆解」把四层沿径向向外拉开成同心层（剖面保持可见）、「搭建」复原，相机自动拉远 / 拉近；
 *   - 拖动旋转、滚轮缩放、点击任一层（或外部按钮）选中高亮、自动旋转、复位视角。
 * 暴露 window.Earth3D.mount({canvas,onSelect,layers}) → {supported,open,close,setActive,toggleExplode,toggleSpin,resetView,isExploded,isSpin}。
 * 主程序异常也不阻断；WebGL 不可用时 supported=false，由调用方降级。
 */
(function () {
  'use strict';

  // 层（从外到内）。半径为相对地球半径 R 的「示意」比例（教学图惯例，内核/外核已放大以便观察；
  // 真实内核仅 0.19R、外核 0.55R、地幔至 0.965R、地壳极薄）。颜色为教科书/科学馆配色。
  var SHELLS = [
    { id: 'crust',  r: 1.000, rIn: 0.900, color: [0.42, 0.27, 0.16], emis: 0.00, ex: -4.2 },
    { id: 'mantle', r: 0.900, rIn: 0.580, color: [0.80, 0.20, 0.10], emis: 0.05, ex: -2.1 },
    { id: 'outer',  r:0.580, rIn: 0.320, color: [1.00, 0.62, 0.10], emis: 0.55, ex:  2.1 },
    { id: 'inner',  r: 0.320, rIn: 0.000, color: [1.00, 0.97, 0.85], emis: 0.95, ex:  4.2 }
  ];
  var PLANET_R = 1.0;
  var D_ASSEMBLED = 2.9;
  var AZ0 = 0.62, EL0 = 0.34;      // 固定观察机位（方位 / 仰角）：对象自转不再与机位同步（否则互相抵消，看起来「转了像没转」）
  var AZ_EXP = -0.06, EL_EXP = 0.48;   // 拆解态视角：略微俯视的斜角——四层被拉开的壳既有剖面又有立体弧形
                                       // （复原态要用 0.62：那时剖面是两个整圆盘，正面看才是完整靶心）
  var LIGHT = norm3(0.45, 0.82, 0.55);
  var ATM_COLOR = [0.32, 0.58, 1.0];
  // 「拆解」：每层保持真实层厚，层与层之间留出统一的明显缝隙（EXPLODE_GAP），由内向外逐层拉开——
  // 与主界面「片沿法线弹起、悬停在球面外侧、框架保留」同风格，是「层次被拆开」而不是散成几个小球。
  // 半径唯一来源：explodeRing（剖面半环、球体缩放、标签锚点、拾取全部共用，避免三处数值打架）。
  var EXPLODE_GAP = 0.40;                            // 层间缝隙（相对地球半径）
  var EXPLODE_RING = {}, _acc = 0;
  for (var _i = SHELLS.length - 1; _i >= 0; _i--) {   // SHELLS 是外→内，这里反向按内→外累加「层厚 + 缝」
    var _sh = SHELLS[_i], _th = _sh.r - _sh.rIn;
    if (_i < SHELLS.length - 1) _acc += EXPLODE_GAP;
    EXPLODE_RING[_sh.id] = { i: _acc, o: _acc + _th };
    _acc += _th;
  }
  var TARGET_R = {};
  SHELLS.forEach(function (s) { TARGET_R[s.id] = EXPLODE_RING[s.id].o; });
  // 拆解态最外层半径（决定相机拉远距离，保证整体不被裁切）
  var EXPLODE_MAX_R = EXPLODE_RING[SHELLS[0].id].o;
  var D_EXPLODED = Math.max(4.3, 3.4 * EXPLODE_MAX_R);

  // 不连续面（相对半径，用于剖面标注）
  var DISCS = [
    { r: 0.900, name: '莫霍面', depth: '≈35 km' },
    { r: 0.580, name: '古登堡面', depth: '2890 km' },
    { r: 0.320, name: '莱曼面', depth: '5150 km' }
  ];

  function norm3(x, y, z) { var l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; }

  /* ---------------- 矩阵（列主序） ---------------- */
  function perspective(fovy, aspect, near, far) {
    var f = 1.0 / Math.tan(fovy / 2), nf = 1 / (near - far);
    var o = new Float32Array(16);
    o[0] = f / aspect; o[5] = f; o[10] = (far + near) * nf; o[11] = -1;
    o[14] = (2 * far * near) * nf; return o;
  }
  function mul(a, b) {
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++)
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  }
  function lookAt(eye, c, up) {
    var z0 = eye[0] - c[0], z1 = eye[1] - c[1], z2 = eye[2] - c[2];
    var zl = Math.hypot(z0, z1, z2) || 1; z0 /= zl; z1 /= zl; z2 /= zl;
    var x0 = up[1] * z2 - up[2] * z1, x1 = up[2] * z0 - up[0] * z2, x2 = up[0] * z1 - up[1] * z0;
    var xl = Math.hypot(x0, x1, x2) || 1; x0 /= xl; x1 /= xl; x2 /= xl;
    var y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;
    var o = new Float32Array(16);
    o[0] = x0; o[1] = y0; o[2] = z0; o[3] = 0;
    o[4] = x1; o[5] = y1; o[6] = z1; o[7] = 0;
    o[8] = x2; o[9] = y2; o[10] = z2; o[11] = 0;
    o[12] = -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]);
    o[13] = -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]);
    o[14] = -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]);
    o[15] = 1; return o;
  }
  function rx(a) { var c = Math.cos(a), s = Math.sin(a), o = new Float32Array(16); o[0] = 1; o[5] = c; o[6] = s; o[9] = -s; o[10] = c; o[15] = 1; return o; }
  function ry(a) { var c = Math.cos(a), s = Math.sin(a), o = new Float32Array(16); o[0] = c; o[2] = -s; o[5] = 1; o[8] = s; o[10] = c; o[15] = 1; return o; }
  function translate(x, y, z) { var o = new Float32Array(16); o[0] = 1; o[5] = 1; o[10] = 1; o[15] = 1; o[12] = x; o[13] = y; o[14] = z; return o; }
  function scale3(s) { var o = new Float32Array(16); o[0] = s; o[5] = s; o[10] = s; o[15] = 1; return o; }
  function invert(m) {
    var o = new Float32Array(16);
    var a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7],
        a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
    var b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10,
        b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12,
        b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30,
        b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    var det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null; det = 1.0 / det;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return o;
  }
  function mat3mv(m, v) { return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2], m[1]*v[0]+m[5]*v[1]+m[9]*v[2], m[2]*v[0]+m[6]*v[1]+m[10]*v[2]]; }
  function tp(m, v) {
    var x = m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12];
    var y = m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13];
    var z = m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14];
    var w = m[3]*v[0]+m[7]*v[1]+m[11]*v[2]+m[15];
    return [x, y, z, w];
  }

  /* ---------------- 几何 ---------------- */
  function makeSphere(radius, latB, lonB) {
    var pos = [], nrm = [], idx = [];
    for (var i = 0; i <= latB; i++) {
      var th = (i / latB) * Math.PI, st = Math.sin(th), ct = Math.cos(th);
      for (var j = 0; j <= lonB; j++) {
        var ph = (j / lonB) * 2 * Math.PI, sp = Math.sin(ph), cp = Math.cos(ph);
        var x = cp * st, y = ct, z = sp * st;
        pos.push(x * radius, y * radius, z * radius); nrm.push(x, y, z);
      }
    }
    var row = lonB + 1;
    for (var a = 0; a < latB; a++) for (var b = 0; b < lonB; b++) {
      var p0 = a * row + b, p1 = p0 + row;
      idx.push(p0, p1, p0 + 1, p0 + 1, p1, p1 + 1);
    }
    return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint16Array(idx) };
  }
  function makeDisc(radius, seg) {
    var pos = [0, 0, 0], nrm = [0, 0, 1], idx = [];
    for (var j = 0; j <= seg; j++) { var ph = (j / seg) * 2 * Math.PI; pos.push(Math.cos(ph) * radius, Math.sin(ph) * radius, 0); nrm.push(0, 0, 1); }
    for (var k = 1; k <= seg; k++) idx.push(0, k, k + 1);
    return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint16Array(idx) };
  }
  // 半圆面（单位半径）：A = z=0 平面且 x>=0；B = x=0 平面且 z>=0。用于拆解态逐层实心剖面
  function makeHalf(sel, seg) {
    var pos = [0, 0, 0], nrm = [0, 0, 0], idx = [];
    var n = sel === 'A' ? [0, 0, 1] : [1, 0, 0];
    nrm[0] = n[0]; nrm[1] = n[1]; nrm[2] = n[2];
    for (var j = 0; j <= seg; j++) {
      var t = -Math.PI / 2 + (j / seg) * Math.PI, c = Math.cos(t), s = Math.sin(t);
      if (sel === 'A') pos.push(c, s, 0); else pos.push(0, s, c);
      nrm.push(n[0], n[1], n[2]);
    }
    for (var k = 1; k <= seg; k++) idx.push(0, k, k + 1);
    return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint16Array(idx) };
  }

  /* ---------------- 着色器 ---------------- */
  var SPH_VS = [
    'attribute vec3 aPos; attribute vec3 aNormal;',
    'uniform mat4 uProj,uView,uModel;',
    'varying vec3 vWorld; varying vec3 vNormal; varying vec3 vLocal;',
    'void main(){ vec4 wp=uModel*vec4(aPos,1.0); vWorld=wp.xyz;',
    'vNormal=normalize(mat3(uModel)*aNormal); vLocal=aPos;',
    'gl_Position=uProj*uView*wp; }'
  ].join('\n');
  var SPH_FS = [
    'precision mediump float;',
    'uniform vec3 uColor,uEye,uLight; uniform float uSel,uCut,uEmis,uTime;',
    'varying vec3 vWorld,vNormal,vLocal;',
    'void main(){',
    'vec3 N=normalize(vNormal);',
    'if(uCut>0.5){ vec3 d=normalize(vLocal); if(d.x>0.0&&d.z>0.0) discard; }',
    'vec3 Ld=normalize(uLight);',
    'float diff=max(dot(N,Ld),0.0);',
    'float top=clamp(N.y*0.5+0.5,0.0,1.0);',
    'vec3 V=normalize(uEye-vWorld);',
    'vec3 H=normalize(Ld+V);',
    'float spec=pow(max(dot(N,H),0.0),42.0)*0.45*(1.0-uEmis);', // 明确高光点（核部除外）
    'float rim=pow(1.0-max(dot(N,V),0.0),2.2);',
    'float pulse=0.85+0.15*sin(uTime*1.6);',
    'vec3 col=uColor*(0.12+0.94*diff) + uColor*top*0.16;', // 加深背光侧，增强体积感
    'col += uColor*uEmis*pulse;',                 // 核部自发光
    'col += spec;',                                // 高光
    'col += rim*0.18;',                            // 边缘微光
    'if(uSel>0.5){ col=mix(col,vec3(1.0),0.05); col+=rim*0.22; }',   // 选中提示只做轻微提亮，别把层色洗成奶油色
    'gl_FragColor=vec4(col,1.0); }'
  ].join('\n');
  var CAP_VS = [
    'attribute vec3 aPos; attribute vec3 aNormal;',
    'uniform mat4 uProj,uView,uModel;',
    'varying vec3 vNormal; varying float vRad;',
    'void main(){ vec4 wp=uModel*vec4(aPos,1.0); vNormal=normalize(mat3(uModel)*aNormal);',
    'vRad=length(aPos.xy); gl_Position=uProj*uView*wp; }'
  ].join('\n');
  var CAP_FS = [
    'precision mediump float;',
    'uniform vec3 uC0,uC1,uC2,uC3; uniform float uR0,uR1,uR2,uR3;',
    'varying vec3 vNormal; varying float vRad;',
    'void main(){',
    'vec3 c=uC3;',
    'if(vRad<=uR0) c=uC0; else if(vRad<=uR1) c=uC1; else if(vRad<=uR2) c=uC2; else if(vRad<=uR3) c=uC3; else discard;',
    'float ln=0.0;',
    'if(abs(vRad-uR0)<0.008) ln=1.0; if(abs(vRad-uR1)<0.008) ln=1.0; if(abs(vRad-uR2)<0.008) ln=1.0; if(abs(vRad-uR3)<0.008) ln=1.0;',
    'float sh=0.82+0.18*(1.0-clamp(vRad,0.0,1.0));', // 外缘略暗，增加体积感
    'float lit=0.80+0.20*clamp(vNormal.z,0.0,1.0);',  // 朝外（z）更亮
    'c=c*sh*lit; c=mix(c,vec3(0.06,0.05,0.05),ln*0.7);', // 锐利分界线（略柔）
    'gl_FragColor=vec4(c,1.0); }'
  ].join('\n');
  var ATM_VS = [
    'attribute vec3 aPos; attribute vec3 aNormal;',
    'uniform mat4 uProj,uView,uModel;',
    'varying vec3 vWorld; varying vec3 vNormal;',
    'void main(){ vec4 wp=uModel*vec4(aPos,1.0); vWorld=wp.xyz;',
    'vNormal=normalize(mat3(uModel)*aNormal); gl_Position=uProj*uView*wp; }'
  ].join('\n');
  var ATM_FS = [
    'precision mediump float;',
    'uniform vec3 uEye,uColor; varying vec3 vWorld,vNormal;',
    'void main(){ vec3 N=normalize(vNormal); vec3 V=normalize(uEye-vWorld);',
    'float rim=pow(1.0-max(dot(N,V),0.0),2.4);',
    'gl_FragColor=vec4(uColor*rim*0.85, rim*0.8); }'
  ].join('\n');

  var FLAT_VS = [
    'attribute vec3 aPos; attribute vec3 aNormal;',
    'uniform mat4 uProj,uView,uModel; uniform float uPlane;',
    'varying vec3 vN; varying float vRad;',
    'void main(){ vN=normalize(mat3(uModel)*aNormal);',
    'vRad = uPlane < 0.5 ? length(aPos.xy) : length(aPos.yz);',
    'gl_Position=uProj*uView*uModel*vec4(aPos,1.0); }'
  ].join('\n');
  var FLAT_FS = [
    'precision mediump float;',
    'uniform vec3 uColor; uniform float uInnerFrac; varying vec3 vN; varying float vRad;',
    'void main(){',
    'if(vRad < uInnerFrac) discard;',
    'float t=clamp((vRad-uInnerFrac)/max(1.0-uInnerFrac,0.001),0.0,1.0);',
    'float shade=0.80+0.28*t;',                                  // 内侧略暗、外侧略亮，做出切面的体积感
    'float edge=smoothstep(0.0,0.035,t)*smoothstep(0.0,0.035,1.0-t);',
    'vec3 c=uColor*shade*mix(0.58,1.0,edge);',                    // 内外边缘压暗一线，像被切开的一块实体
    'float lit=0.86+0.14*clamp(normalize(vN).y*0.5+0.5,0.0,1.0);',
    'gl_FragColor=vec4(c*lit,1.0); }'
  ].join('\n');

  function compile(gl, type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { var i = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error('着色器编译失败: ' + i); }
    return s;
  }
  function program(gl, vs, fs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('着色器链接失败: ' + gl.getProgramInfoLog(p));
    return p;
  }

  /* ---------------- 公共 API ---------------- */
  function mount(opts) {
    var canvas = opts.canvas, onSelect = opts.onSelect || function () {};
    var meta = opts.layers || null; // [{id,name,depth}] 用于浮标
    var supported = false, api = { supported: false };
    if (!canvas || !canvas.getContext) return api;

    var gl = null;
    try {
      gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false })
        || canvas.getContext('experimental-webgl', { antialias: true, alpha: true });
    } catch (e) { gl = null; }
    if (!gl) return api;
    supported = true;

    var sphProg, capProg, atmProg, flatProg, loc = {}, capLoc = {}, atmLoc = {}, flatLoc = {};
    var sphereGeo, discGeo, atmGeo;
    var shellBuf = {}, discBufA, discBufB, atmBuf, halfBufA, halfBufB;
    var ry90 = ry(Math.PI / 2);
    var labelLayer, labelEls = {}, discEls = {};

    try {
      sphProg = program(gl, SPH_VS, SPH_FS);
      capProg = program(gl, CAP_VS, CAP_FS);
      atmProg = program(gl, ATM_VS, ATM_FS);
      flatProg = program(gl, FLAT_VS, FLAT_FS);
    } catch (e) { return { supported: false }; }

    sphereGeo = makeSphere(1, 30, 40);
    discGeo = makeDisc(PLANET_R, 80);
    atmGeo = makeSphere(1.18, 24, 32);
    var halfGeoA = makeHalf('A', 64), halfGeoB = makeHalf('B', 64);

    function buf(gl, data, target) { var b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW); return b; }
    SHELLS.forEach(function (s) {
      var g = makeSphere(s.r, 26, 36);
      shellBuf[s.id] = { pos: buf(gl, g.pos, gl.ARRAY_BUFFER), nrm: buf(gl, g.nrm, gl.ARRAY_BUFFER), idx: buf(gl, g.idx, gl.ELEMENT_ARRAY_BUFFER), count: g.idx.length };
    });
    discBufA = { pos: buf(gl, discGeo.pos, gl.ARRAY_BUFFER), nrm: buf(gl, discGeo.nrm, gl.ARRAY_BUFFER), idx: buf(gl, discGeo.idx, gl.ELEMENT_ARRAY_BUFFER), count: discGeo.idx.length };
    discBufB = { pos: buf(gl, discGeo.pos, gl.ARRAY_BUFFER), nrm: buf(gl, discGeo.nrm, gl.ARRAY_BUFFER), idx: buf(gl, discGeo.idx, gl.ELEMENT_ARRAY_BUFFER), count: discGeo.idx.length };
    halfBufA = { pos: buf(gl, halfGeoA.pos, gl.ARRAY_BUFFER), nrm: buf(gl, halfGeoA.nrm, gl.ARRAY_BUFFER), idx: buf(gl, halfGeoA.idx, gl.ELEMENT_ARRAY_BUFFER), count: halfGeoA.idx.length };
    halfBufB = { pos: buf(gl, halfGeoB.pos, gl.ARRAY_BUFFER), nrm: buf(gl, halfGeoB.nrm, gl.ARRAY_BUFFER), idx: buf(gl, halfGeoB.idx, gl.ELEMENT_ARRAY_BUFFER), count: halfGeoB.idx.length };
    atmBuf = { pos: buf(gl, atmGeo.pos, gl.ARRAY_BUFFER), nrm: buf(gl, atmGeo.nrm, gl.ARRAY_BUFFER), idx: buf(gl, atmGeo.idx, gl.ELEMENT_ARRAY_BUFFER), count: atmGeo.idx.length };

    ['uProj', 'uView', 'uModel', 'uColor', 'uEye', 'uLight', 'uSel', 'uCut', 'uEmis', 'uTime'].forEach(function (k) { loc[k] = gl.getUniformLocation(sphProg, k); });
    ['aPos', 'aNormal'].forEach(function (k) { loc[k] = gl.getAttribLocation(sphProg, k); });
    ['uProj', 'uView', 'uModel', 'uC0', 'uC1', 'uC2', 'uC3', 'uR0', 'uR1', 'uR2', 'uR3'].forEach(function (k) { capLoc[k] = gl.getUniformLocation(capProg, k); });
    ['aPos', 'aNormal'].forEach(function (k) { capLoc[k] = gl.getAttribLocation(capProg, k); });
    ['uProj', 'uView', 'uModel', 'uEye', 'uColor'].forEach(function (k) { atmLoc[k] = gl.getUniformLocation(atmProg, k); });
    ['aPos', 'aNormal'].forEach(function (k) { atmLoc[k] = gl.getAttribLocation(atmProg, k); });
    ['uProj', 'uView', 'uModel', 'uColor', 'uPlane', 'uInnerFrac'].forEach(function (k) { flatLoc[k] = gl.getUniformLocation(flatProg, k); });
    ['aPos', 'aNormal'].forEach(function (k) { flatLoc[k] = gl.getAttribLocation(flatProg, k); });

    // 标签层（HTML 投影浮标）
    try {
      var parent = canvas.parentElement;
      if (parent && getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
      labelLayer = document.createElement('div');
      labelLayer.className = 'gp-k3d-labels';
      if (parent) parent.appendChild(labelLayer);
      SHELLS.forEach(function (s) {
        var m = (meta && meta[s.id]) ? meta[s.id] : { name: s.id, depth: '' };
        var el = document.createElement('div');
        el.className = 'gp-k3d-label';
        el.innerHTML = '<span class="k3d-dot"></span><span class="k3d-tx">' + esc(m.name) + (m.depth ? ' <i>' + esc(m.depth) + '</i>' : '') + '</span>';
        var dot = el.querySelector('.k3d-dot');
        if (dot) { var rc = 'rgb(' + (s.color[0] * 255 | 0) + ',' + (s.color[1] * 255 | 0) + ',' + (s.color[2] * 255 | 0) + ')'; dot.style.background = rc; dot.style.color = rc; }
        if (parent) parent.appendChild(el);
        labelEls[s.id] = el;
      });
      DISCS.forEach(function (d, i) {
        var el = document.createElement('div');
        el.className = 'gp-k3d-disc';
        el.innerHTML = '<span class="k3d-tx">' + esc(d.name) + ' <i>' + esc(d.depth) + '</i></span>';
        if (parent) parent.appendChild(el);
        discEls[i] = el;
      });
    } catch (e) { labelLayer = null; }

    var state = {
      az: 0.62, el: 0.34, azT: null, elT: null, d: D_ASSEMBLED, zoom: 1,
      e: 0, eTarget: 0, sel: 'crust', spin: false,
      dragging: false, lastX: 0, lastY: 0, running: false, needResize: false, t: 0
    };
    // 每层的径向膨胀系数（拆解时由 1 → TARGET_R[s]/s.r 平滑过渡）
    function scaleFor(s) { var t = TARGET_R[s.id] || s.r; return 1 + state.e * (t / s.r - 1); }
    function baseDist() { return D_ASSEMBLED + state.e * (D_EXPLODED - D_ASSEMBLED); }

    function resize() {
      var w = canvas.clientWidth || 300, h = canvas.clientHeight || 240;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    function resizeIfNeeded() {
      var w = canvas.clientWidth || 300, h = canvas.clientHeight || 240;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var W = Math.max(1, Math.round(w * dpr)), H = Math.max(1, Math.round(h * dpr));
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; gl.viewport(0, 0, W, H); }
    }

    function frame() {
      if (!state.running) return;
      window.requestAnimationFrame(frame);
      state.t += 0.016;
      if (state.needResize) { resize(); state.needResize = false; }
      state.e += (state.eTarget - state.e) * 0.16;
      if (Math.abs(state.eTarget - state.e) < 0.002) state.e = state.eTarget;
      state.d = baseDist() * state.zoom;
      if (state.spin && !state.dragging) {
        if (state.eTarget > 0.5) {
          // 拆解态：来回小幅摆动——能看出立体感，又不会把剖面转到背后只剩一个球
          state.azT = AZ_EXP + 0.22 * Math.sin(state.t * 0.85);
          state.elT = EL_EXP + 0.07 * Math.sin(state.t * 0.6);
        } else {
          state.az += 0.006;   // 复原态：整圈自转
        }
      }
      // 视角平滑过渡（拆解/搭建会换一个更合适的观察角，直接跳会闪一下）
      if (state.azT != null) {
        state.az += (state.azT - state.az) * 0.20;
        state.el += (state.elT - state.el) * 0.20;
        if (Math.abs(state.azT - state.az) < 0.003 && Math.abs(state.elT - state.el) < 0.003) {
          state.az = state.azT; state.el = state.elT;
          if (!state.spin) { state.azT = null; state.elT = null; }
        }
      }
      draw();
    }

    function placeLabel(el, world, screen, vis) {
      if (!el) return;
      if (!vis) { el.style.display = 'none'; return; }
      el.style.display = 'block';
      // 尺寸只量一次（文字固定），避免每帧强制重排
      if (!el._lw) { el._lw = el.offsetWidth || 80; el._lh = el.offsetHeight || 18; }
      // 夹在画布内：此前最外圈的不连续面标签会贴到底边被 overflow 裁掉半截
      var W = state.cssW || 1, H = state.cssH || 1, pad = 3;
      var x = Math.min(W - el._lw / 2 - pad, Math.max(el._lw / 2 + pad, screen[0]));
      var y = Math.min(H - el._lh / 2 - pad, Math.max(el._lh / 2 + pad, screen[1]));
      el.style.left = x + 'px';
      el.style.top = y + 'px';
    }

    // 给定局部半径 r 与角度 a，在剖面（A: z=0 平面法线 +z；B: x=0 平面法线 +x）上取点，返回朝向相机者。
    // allowB=false 时只在 A 面（用于不连续面，避免旋转到 B 面时标签落到未暴露区域）。
    function faceAnchor(r, a, model, view, proj, eye, cssW, cssH, allowB) {
      var cands = [
        { p: [r * Math.cos(a), r * Math.sin(a), 0], n: [0, 0, 1] },       // 面 A（z=0，暴露 x>0）
        { p: [0, r * Math.cos(a), r * Math.sin(a)], n: [1, 0, 0] }        // 面 B（x=0，暴露 z>0）
      ];
      if (!allowB) cands.pop();
      for (var i = 0; i < cands.length; i++) {
        var wld = tp(model, cands[i].p);
        var wn = mat3mv(model, cands[i].n);
        var wp = [wld[0] / wld[3], wld[1] / wld[3], wld[2] / wld[3]];
        var toEye = [eye[0] - wp[0], eye[1] - wp[1], eye[2] - wp[2]];
        var facing = wn[0] * toEye[0] + wn[1] * toEye[1] + wn[2] * toEye[2];
        if (facing <= 0) continue;
        var clip = tp(mul(proj, view), wp);
        if (clip[3] <= 0.0001) continue;
        var ndcx = clip[0] / clip[3], ndcy = clip[1] / clip[3];
        var sx = (ndcx * 0.5 + 0.5) * cssW, sy = (1 - (ndcy * 0.5 + 0.5)) * cssH;
        if (sx < -40 || sx > cssW + 40 || sy < -40 || sy > cssH + 40) continue;
        return { x: sx, y: sy, vis: true };
      }
      return { x: 0, y: 0, vis: false };
    }

    function draw() {
      resizeIfNeeded();
      gl.clearColor(0, 0, 0, 0);
      gl.enable(gl.DEPTH_TEST);
      gl.disable(gl.BLEND);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      var aspect = canvas.width / canvas.height;
      var proj = perspective(42 * Math.PI / 180, aspect, 0.1, 200);
      // 机位固定；对象由 state.az/el 自转（这样「自动旋转」和拖拽都能看到真实转动）
      var eye = [state.d * Math.cos(EL0) * Math.sin(AZ0), state.d * Math.sin(EL0), state.d * Math.cos(EL0) * Math.cos(AZ0)];
      var view = lookAt(eye, [0, 0, 0], [0, 1, 0]);
      var rot = mul(ry(state.az), rx(state.el));
      var cut = 1.0;                                   // 剖切常开：拆解时仍露出内部各层，不再变成实心球
      var maxScale = scaleFor(SHELLS[0]);              // 最外层膨胀系数，用于大气与标签半径
      var cssW = canvas.clientWidth || 1, cssH = canvas.clientHeight || 1;
      state.cssW = cssW; state.cssH = cssH;   // 供标签夹边使用（避免每帧再读 clientWidth 触发重排）

      // 大气辉光（背面 + 加色混合）
      gl.useProgram(atmProg);
      gl.uniformMatrix4fv(atmLoc.uProj, false, proj);
      gl.uniformMatrix4fv(atmLoc.uView, false, view);
      gl.uniformMatrix4fv(atmLoc.uModel, false, mul(rot, scale3(maxScale)));
      gl.uniform3fv(atmLoc.uEye, eye);
      gl.uniform3fv(atmLoc.uColor, ATM_COLOR);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.depthMask(false); gl.enable(gl.CULL_FACE); gl.cullFace(gl.FRONT);
      gl.enableVertexAttribArray(atmLoc.aPos); gl.enableVertexAttribArray(atmLoc.aNormal);
      gl.bindBuffer(gl.ARRAY_BUFFER, atmBuf.pos); gl.vertexAttribPointer(atmLoc.aPos, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, atmBuf.nrm); gl.vertexAttribPointer(atmLoc.aNormal, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, atmBuf.idx);
      gl.drawElements(gl.TRIANGLES, atmBuf.count, gl.UNSIGNED_SHORT, 0);
      gl.disable(gl.CULL_FACE); gl.depthMask(true); gl.disable(gl.BLEND);

      // 球体
      gl.useProgram(sphProg);
      gl.uniformMatrix4fv(loc.uProj, false, proj);
      gl.uniformMatrix4fv(loc.uView, false, view);
      gl.uniform3fv(loc.uEye, eye);
      gl.uniform3fv(loc.uLight, LIGHT);
      gl.uniform1f(loc.uCut, cut);
      gl.uniform1f(loc.uTime, state.t);
      gl.enableVertexAttribArray(loc.aPos); gl.enableVertexAttribArray(loc.aNormal);

      var models = {};
      // 只画「朝外的面」：这样剖切窗口里没有内壁瞎填，拆解态层与层之间露出的就是真实背景（暗空），
      // 缝隙才看得出是「分开的」。
      gl.enable(gl.CULL_FACE); gl.cullFace(gl.FRONT);   // 球面绕向朝内，剔 FRONT 才是「只画朝外的面」
      SHELLS.forEach(function (s) {
        var model = mul(rot, scale3(scaleFor(s)));
        models[s.id] = model;
        var b = shellBuf[s.id];
        gl.bindBuffer(gl.ARRAY_BUFFER, b.pos); gl.vertexAttribPointer(loc.aPos, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, b.nrm); gl.vertexAttribPointer(loc.aNormal, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.idx);
        gl.uniformMatrix4fv(loc.uModel, false, model);
        gl.uniform3fv(loc.uColor, s.color);
        gl.uniform1f(loc.uEmis, s.emis);
        gl.uniform1f(loc.uSel, s.id === state.sel ? 1.0 : 0.0);
        gl.drawElements(gl.TRIANGLES, b.count, gl.UNSIGNED_SHORT, 0);
      });
      gl.disable(gl.CULL_FACE);

      // 剖面圆盘（仅复原态）
      if (state.e < 0.08) {
        gl.useProgram(capProg);
        gl.uniformMatrix4fv(capLoc.uProj, false, proj);
        gl.uniformMatrix4fv(capLoc.uView, false, view);
        gl.uniform3fv(capLoc.uC0, SHELLS[3].color);
        gl.uniform3fv(capLoc.uC1, SHELLS[2].color);
        gl.uniform3fv(capLoc.uC2, SHELLS[1].color);
        gl.uniform3fv(capLoc.uC3, SHELLS[0].color);
        gl.uniform1f(capLoc.uR0, SHELLS[3].r);
        gl.uniform1f(capLoc.uR1, SHELLS[2].r);
        gl.uniform1f(capLoc.uR2, SHELLS[1].r);
        gl.uniform1f(capLoc.uR3, SHELLS[0].r);
        gl.enableVertexAttribArray(capLoc.aPos); gl.enableVertexAttribArray(capLoc.aNormal);
        var mA = rot;
        gl.bindBuffer(gl.ARRAY_BUFFER, discBufA.pos); gl.vertexAttribPointer(capLoc.aPos, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, discBufA.nrm); gl.vertexAttribPointer(capLoc.aNormal, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, discBufA.idx);
        gl.uniformMatrix4fv(capLoc.uModel, false, mA);
        gl.drawElements(gl.TRIANGLES, discBufA.count, gl.UNSIGNED_SHORT, 0);
        var mB = mul(rot, ry90);
        gl.bindBuffer(gl.ARRAY_BUFFER, discBufB.pos); gl.vertexAttribPointer(capLoc.aPos, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, discBufB.nrm); gl.vertexAttribPointer(capLoc.aNormal, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, discBufB.idx);
        gl.uniformMatrix4fv(capLoc.uModel, false, mB);
        gl.drawElements(gl.TRIANGLES, discBufB.count, gl.UNSIGNED_SHORT, 0);
      } else {
        // 拆解态：每层画成一条「整圆环带」剖面（真实层厚 + 明显缝隙），叠出彼此分离的同心层。
        // 用整圆盘而不是两个半圆盘：半圆盘在斜角下会拼出心形折痕，整圆环带则是连续完整的环，
        // 被壳挡住的部分自然隐藏——看上去就是「一层层壳被拉开」。
        gl.useProgram(flatProg);
        gl.uniformMatrix4fv(flatLoc.uProj, false, proj);
        gl.uniformMatrix4fv(flatLoc.uView, false, view);
        gl.uniform1f(flatLoc.uPlane, 0);                 // 圆盘几何本身就在 z=0 平面，半径用 length(xy)
        gl.enableVertexAttribArray(flatLoc.aPos); gl.enableVertexAttribArray(flatLoc.aNormal);
        var fnA = mat3mv(rot, [0, 0, 1]), fnB = mat3mv(rot, [1, 0, 0]);
        var sA = (fnA[0] * eye[0] + fnA[1] * eye[1] + fnA[2] * eye[2]) > 0;
        var sB = (fnB[0] * eye[0] + fnB[1] * eye[1] + fnB[2] * eye[2]) > 0;
        var faceList = [];
        if (sA) faceList.push({ b: halfBufA, plane: 0 });
        if (sB) faceList.push({ b: halfBufB, plane: 1 });
        faceList.forEach(function (f) {
          gl.uniform1f(flatLoc.uPlane, f.plane);
          SHELLS.forEach(function (s) {
            var rb = EXPLODE_RING[s.id];
            var outerE = s.r + state.e * (rb.o - s.r);
            var innerE = s.rIn + state.e * (rb.i - s.rIn);
            gl.uniformMatrix4fv(flatLoc.uModel, false, mul(rot, scale3(outerE)));
            gl.uniform1f(flatLoc.uInnerFrac, outerE > 0 ? innerE / outerE : 0);
            gl.uniform3fv(flatLoc.uColor, s.color);
            gl.bindBuffer(gl.ARRAY_BUFFER, f.b.pos); gl.vertexAttribPointer(flatLoc.aPos, 3, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ARRAY_BUFFER, f.b.nrm); gl.vertexAttribPointer(flatLoc.aNormal, 3, gl.FLOAT, false, 0, 0);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, f.b.idx);
            gl.drawElements(gl.TRIANGLES, f.b.count, gl.UNSIGNED_SHORT, 0);
          });
        });
      }

      // 标签（HTML 投影）：锚点在剖面上，再沿径向推到星球外侧成环形，避免与球体重叠
      if (labelLayer) {
        var cClip = tp(mul(proj, view), [0, 0, 0]);
        var cx = (cClip[0] / cClip[3] * 0.5 + 0.5) * cssW, cy = (1 - (cClip[1] / cClip[3] * 0.5 + 0.5)) * cssH;
        var rScreen = 1;
        [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach(function (d) {
          var w = tp(rot, [d[0] * maxScale, d[1] * maxScale, d[2] * maxScale]); var cl = tp(mul(proj, view), [w[0], w[1], w[2]]);
          if (cl[3] <= 0) return;
          var x = (cl[0] / cl[3] * 0.5 + 0.5) * cssW, y = (1 - (cl[1] / cl[3] * 0.5 + 0.5)) * cssH;
          var dd = Math.hypot(x - cx, y - cy); if (dd > rScreen) rScreen = dd;
        });
        function pushOut(a, off) {
          if (!a.vis) return a;
          var dx = a.x - cx, dy = a.y - cy, dl = Math.hypot(dx, dy);
          if (dl < 1) return a;
          var want = rScreen + off;
          return { x: cx + dx / dl * want, y: cy + dy / dl * want, vis: true };
        }
        var angL = [1.45, 1.02, 0.60, 0.18];  // 由外到内，剖面上半部扇形角度（弧度）
        SHELLS.forEach(function (s, i) {
          // 锚点落在「当前状态下」这一层环带正中：复原态用真实中径，拆解态用拉开的环带中径，
          // 再换算回对象空间（模型矩阵里已含 scaleFor），避免缝隙变大后浮标飘到层外。
          var rb = EXPLODE_RING[s.id];
          var midAssembled = (s.rIn + s.r) * 0.5;
          var midExploded = (rb.i + rb.o) * 0.5;
          var midR = (midAssembled + state.e * (midExploded - midAssembled)) / scaleFor(s);
          var a = faceAnchor(midR, angL[i], models[s.id], view, proj, eye, cssW, cssH, true);
          var p = pushOut(a, 30);
          placeLabel(labelEls[s.id], null, [p.x, p.y], p.vis);
        });
        var showDisc = state.e < 0.08;
        var angD = [-0.45, -0.90, -1.35];     // 剖面下半部，与层标签拉开
        DISCS.forEach(function (d, i) {
          var a = showDisc ? faceAnchor(d.r, angD[i], rot, view, proj, eye, cssW, cssH, false) : { x: 0, y: 0, vis: false };
          var p = pushOut(a, 24);
          placeLabel(discEls[i], null, [p.x, p.y], p.vis);
        });
      }
    }

    // ---- 拾取 ----
    function pick(px, py) {
      var w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
      var nx = (px / w) * 2 - 1, ny = 1 - (py / h) * 2;
      var aspect = canvas.width / canvas.height;
      var proj = perspective(42 * Math.PI / 180, aspect, 0.1, 200);
      var eye = [state.d * Math.cos(EL0) * Math.sin(AZ0), state.d * Math.sin(EL0), state.d * Math.cos(EL0) * Math.cos(AZ0)];
      var view = lookAt(eye, [0, 0, 0], [0, 1, 0]);
      var rot = mul(ry(state.az), rx(state.el));
      var vp = mul(proj, view);
      var inv = invert(vp); if (!inv) return;
      function un(x, y, z) { var o = [0, 0, 0, 0]; for (var r = 0; r < 4; r++) o[r] = inv[r] * x + inv[4 + r] * y + inv[8 + r] * z + inv[12 + r] * 1; return [o[0] / o[3], o[1] / o[3], o[2] / o[3]]; }
      var near = un(nx, ny, -1), far = un(nx, ny, 1);
      // 把射线变换到对象空间（对象自转 + 各层径向缩放），球心都在原点
      var ir = invert(rot);
      function toObj(p) { return [ir[0] * p[0] + ir[4] * p[1] + ir[8] * p[2] + ir[12], ir[1] * p[0] + ir[5] * p[1] + ir[9] * p[2] + ir[13], ir[2] * p[0] + ir[6] * p[1] + ir[10] * p[2] + ir[14]]; }
      var O = toObj(near), Far = toObj(far);
      var dx = Far[0] - O[0], dy = Far[1] - O[1], dz = Far[2] - O[2];
      var dl = Math.hypot(dx, dy, dz) || 1; dx /= dl; dy /= dl; dz /= dl;
      var D = [dx, dy, dz];
      var cut = true;                                   // 剖切常开，与渲染一致
      var bestT = Infinity, bestId = null;
      SHELLS.forEach(function (s) {
        var rr = s.r * scaleFor(s);
        var b = O[0] * D[0] + O[1] * D[1] + O[2] * D[2];
        var c = O[0] * O[0] + O[1] * O[1] + O[2] * O[2] - rr * rr;
        var disc = b * b - c; if (disc < 0) return;
        var sq = Math.sqrt(disc);
        [(-b - sq), (-b + sq)].forEach(function (t) {
          if (t <= 0.0001) return;
          var lx = (O[0] + t * D[0]) / rr, ly = (O[1] + t * D[1]) / rr, lz = (O[2] + t * D[2]) / rr;
          if (cut && lx > 0 && lz > 0) return;
          if (t < bestT) { bestT = t; bestId = s.id; }
        });
      });
      if (cut && state.e < 0.08) {   // 剖面圆盘只在复原态参与拾取
        function capHit(plane) {
          var denom = plane === 'A' ? D[2] : D[0];
          if (Math.abs(denom) < 1e-6) return null;
          var t = plane === 'A' ? (0 - O[2]) / denom : (0 - O[0]) / denom;
          if (t <= 0.0001) return null;
          var P = [O[0] + t * D[0], O[1] + t * D[1], O[2] + t * D[2]];
          var r = plane === 'A' ? (P[0] <= 0 ? -1 : Math.hypot(P[0], P[1])) : (P[2] <= 0 ? -1 : Math.hypot(P[1], P[2]));
          if (r < 0 || r > PLANET_R) return null;
          return { t: t, r: r };
        }
        var a = capHit('A'), bC = capHit('B'), cap = null;
        if (a && (!bC || a.t < bC.t)) cap = a; else if (bC) cap = bC;
        if (cap && cap.t < bestT) {
          bestId = cap.r <= SHELLS[3].r ? 'inner' : cap.r <= SHELLS[2].r ? 'outer' : cap.r <= SHELLS[1].r ? 'mantle' : 'crust';
          bestT = cap.t;
        }
      }
      if (bestId) onSelect(bestId);
    }

    // ---- 交互 ----
    function onDown(e) { state.dragging = true; state.azT = null; state.elT = null; state.lastX = e.clientX; state.lastY = e.clientY; if (canvas.setPointerCapture && e.pointerId != null) { try { canvas.setPointerCapture(e.pointerId); } catch (x) {} } }
    function onMove(e) { if (!state.dragging) return; var dx = e.clientX - state.lastX, dy = e.clientY - state.lastY; state.lastX = e.clientX; state.lastY = e.clientY; state.az -= dx * 0.008; state.el += dy * 0.008; state.el = Math.max(-1.45, Math.min(1.45, state.el)); }
    var downX = 0, downY = 0;
    canvas.addEventListener('pointerdown', function (e) { downX = e.clientX; downY = e.clientY; onDown(e); });
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', function (e) { var dist = Math.hypot(e.clientX - downX, e.clientY - downY); state.dragging = false; if (dist < 5 && state.running) pick(e.clientX - canvas.getBoundingClientRect().left, e.clientY - canvas.getBoundingClientRect().top); });
    canvas.addEventListener('pointercancel', function () { state.dragging = false; });
    canvas.addEventListener('wheel', function (e) { e.preventDefault(); state.zoom *= (e.deltaY > 0 ? 1.1 : 1 / 1.1); state.zoom = Math.max(0.45, Math.min(3, state.zoom)); state.d = baseDist() * state.zoom; }, { passive: false });
    window.addEventListener('resize', function () { if (state.running) state.needResize = true; });

    function open() { if (!supported) return; state.needResize = true; if (!state.running) { state.running = true; frame(); } }
    function close() { state.running = false; if (labelLayer) { for (var k in labelEls) if (labelEls[k]) labelEls[k].style.display = 'none'; for (var j in discEls) if (discEls[j]) discEls[j].style.display = 'none'; } }

    api = {
      supported: true, open: open, close: close,
      setActive: function (id) { state.sel = id; if (state.running) draw(); },
      toggleExplode: function () {
        var willExplode = !(state.eTarget > 0.5);
        state.eTarget = willExplode ? 1 : 0;
        // 拆解 / 搭建都换到最合适的观察角（用目标值平滑转过去，直接跳会闪一下）：
        // 拆解用略俯视的斜角，既看得到四层剖面，又看得到壳的立体弧形。
        state.azT = willExplode ? AZ_EXP : AZ0;
        state.elT = willExplode ? EL_EXP : EL0;
        state.zoom = 1; state.d = baseDist();
        if (state.running) draw();
        return state.eTarget > 0.5;
      },
      toggleSpin: function () { state.spin = !state.spin; if (!state.spin) { state.azT = null; state.elT = null; } if (state.running) draw(); return state.spin; },
      resetView: function () {
        var ex = state.eTarget > 0.5;
        state.azT = ex ? AZ_EXP : AZ0; state.elT = ex ? EL_EXP : EL0;
        state.zoom = 1; state.d = baseDist() * state.zoom; if (state.running) draw();
      },
      isExploded: function () { return state.eTarget > 0.5; },
      isSpin: function () { return state.spin; }
    };
    return api;
  }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }

  window.Earth3D = { mount: mount };
})();
