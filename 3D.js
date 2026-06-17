//1. 极简数学库
const Mat4 = {
    create: () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]),
    perspective(out, fovy, aspect, near, far) {
        const f = 1.0 / Math.tan(fovy / 2), nf = 1 / (near - far);
        out[0]=f/aspect; out[1]=0; out[2]=0; out[3]=0;
        out[4]=0; out[5]=f; out[6]=0; out[7]=0;
        out[8]=0; out[9]=0; out[10]=(far+near)*nf; out[11]=-1;
        out[12]=0; out[13]=0; out[14]=2*far*near*nf; out[15]=0;
        return out;
    },
    lookAt(out, eye, center, up) {
        let x0,x1,x2,y0,y1,y2,z0,z1,z2,len;
        z0=eye[0]-center[0]; z1=eye[1]-center[1]; z2=eye[2]-center[2];
        len=1/Math.hypot(z0,z1,z2); z0*=len; z1*=len; z2*=len;
        x0=up[1]*z2-up[2]*z1; x1=up[2]*z0-up[0]*z2; x2=up[0]*z1-up[1]*z0;
        len=Math.hypot(x0,x1,x2);
        if(len){len=1/len; x0*=len; x1*=len; x2*=len;} else {x0=x1=x2=0;}
        y0=z1*x2-z2*x1; y1=z2*x0-z0*x2; y2=z0*x1-z1*x0;
        len=Math.hypot(y0,y1,y2);
        if(len){len=1/len; y0*=len; y1*=len; y2*=len;} else {y0=y1=y2=0;}
        out[0]=x0;out[1]=y0;out[2]=z0;out[3]=0;
        out[4]=x1;out[5]=y1;out[6]=z1;out[7]=0;
        out[8]=x2;out[9]=y2;out[10]=z2;out[11]=0;
        out[12]=-(x0*eye[0]+x1*eye[1]+x2*eye[2]);
        out[13]=-(y0*eye[0]+y1*eye[1]+y2*eye[2]);
        out[14]=-(z0*eye[0]+z1*eye[1]+z2*eye[2]);
        out[15]=1;
        return out;
    },
    multiply(out, a, b) {
        for(let i=0;i<4;i++) for(let j=0;j<4;j++){
            out[i*4+j]=0;
            for(let k=0;k<4;k++) out[i*4+j]+=a[k*4+j]*b[i*4+k];
        }
        return out;
    },
    ortho(out, left, right, bottom, top, near, far) {
        const lr = 1 / (left - right);
        const bt = 1 / (bottom - top);
        const nf = 1 / (near - far);
        out[0] = -2 * lr; out[1] = 0; out[2] = 0; out[3] = 0;
        out[4] = 0; out[5] = -2 * bt; out[6] = 0; out[7] = 0;
        out[8] = 0; out[9] = 0; out[10] = 2 * nf; out[11] = 0;
        out[12] = (left + right) * lr;
        out[13] = (top + bottom) * bt;
        out[14] = (far + near) * nf;
        out[15] = 1;
        return out;
    }
};

const canvas = document.getElementById('glCanvas');
const gl = canvas.getContext('webgl', { antialias: true, alpha: false, stencil: true });
if (!gl) { alert('您的浏览器不支持 WebGL'); throw new Error('No WebGL'); }

function createShader(gl, type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(s)); gl.deleteShader(s); return null;
    }
    return s;
}
function createProgram(gl, vsSrc, fsSrc) {
    const p = gl.createProgram();
    gl.attachShader(p, createShader(gl, gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, createShader(gl, gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(p)); return null;
    }
    return p;
}

// GLSL 着色器源码 - 线条渲染
const VS_LINE = `
attribute vec3 aPos;
attribute vec4 aColor;
uniform mat4 uMVP;
uniform float uGridAlpha;
varying vec4 vColor;
void main(){
    gl_Position = uMVP * vec4(aPos, 1.0);
    vColor = aColor;
}`;
const FS_LINE = `
precision mediump float;
varying vec4 vColor;
uniform float uGridAlpha;
void main(){
    vec4 color = vColor;
    if (uGridAlpha < 1.0) {
        color = vec4(0.7, 0.85, 1.0, uGridAlpha);
    }
    gl_FragColor = color;
}`;

// GLSL 着色器源码 - 网格渲染（带光照）
const VS_MESH = `
attribute vec3 aPos;
attribute vec3 aNormal;
uniform mat4 uMVP;
uniform mat4 uModel;
varying vec3 vNormal;
varying vec3 vPos;
void main(){
    gl_Position = uMVP * vec4(aPos, 1.0);
    vNormal = mat3(uModel) * aNormal;
    vPos = (uModel * vec4(aPos, 1.0)).xyz;
}`;
const FS_MESH = `
precision mediump float;
varying vec3 vNormal;
varying vec3 vPos;
uniform vec3 uColor;
uniform float uAmbient;
uniform int uClipEnabled;
uniform vec4 uClipPlane;
void main(){
    if (uClipEnabled == 1) {
        float d = dot(vPos, uClipPlane.xyz) + uClipPlane.w;
        if (d > 0.0) discard;
    }
    vec3 lightDir = normalize(vec3(0.5, 0.5, 1.0));
    vec3 normal = normalize(vNormal);
    float diff = max(dot(normal, lightDir), 0.0);
    // 补光：从反方向来的弱光
    vec3 lightDir2 = normalize(vec3(-0.3, -0.2, 0.5));
    float diff2 = max(dot(normal, lightDir2), 0.0) * 0.3;
    vec3 color = uColor * (uAmbient + diff * 0.7 + diff2);
    gl_FragColor = vec4(color, 1.0);
}`;

// 轮廓边缘着色器（反转外壳：沿物体空间法线膨胀，仅渲染背面）
const VS_OUTLINE = `
attribute vec3 aPos;
attribute vec3 aNormal;
uniform mat4 uMVP;
uniform float uOutlineWidth;
void main(){
    vec3 n = aNormal;
    float len = length(n);
    if (len > 0.0001) n = n / len;
    // 沿物体空间法线方向膨胀顶点
    vec3 expandedPos = aPos + n * uOutlineWidth;
    gl_Position = uMVP * vec4(expandedPos, 1.0);
}`;
const FS_OUTLINE = `
precision mediump float;
void main(){
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
}`;

const lineProgram = createProgram(gl, VS_LINE, FS_LINE);
const meshProgram = createProgram(gl, VS_MESH, FS_MESH);
const outlineProgram = createProgram(gl, VS_OUTLINE, FS_OUTLINE);

// GLSL 着色器源码 - 剖切平面渲染（不需要法线）
const VS_SECTION = `
attribute vec3 aPos;
attribute vec4 aColor;
uniform mat4 uMVP;
varying vec4 vColor;
void main(){
    gl_Position = uMVP * vec4(aPos, 1.0);
    vColor = aColor;
}`;
const FS_SECTION = `
precision mediump float;
varying vec4 vColor;
void main(){
    gl_FragColor = vColor;
}`;

// 创建剖切平面着色器程序（带完整错误检查）
let sectionProgram = null;
let sectionU_MVP = null;
let sectionAPos = -1;
let sectionAColor = -1;

function initSectionProgram() {
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, VS_SECTION);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
        console.error('VS_SECTION compile error:', gl.getShaderInfoLog(vs));
        gl.deleteShader(vs);
        return false;
    }
    
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, FS_SECTION);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        console.error('FS_SECTION compile error:', gl.getShaderInfoLog(fs));
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        return false;
    }
    
    sectionProgram = gl.createProgram();
    gl.attachShader(sectionProgram, vs);
    gl.attachShader(sectionProgram, fs);
    gl.linkProgram(sectionProgram);
    
    if (!gl.getProgramParameter(sectionProgram, gl.LINK_STATUS)) {
        console.error('sectionProgram link error:', gl.getProgramInfoLog(sectionProgram));
        gl.deleteProgram(sectionProgram);
        sectionProgram = null;
        gl.deleteShader(vs);
        gl.deleteShader(fs);
        return false;
    }
    
    sectionU_MVP = gl.getUniformLocation(sectionProgram, 'uMVP');
    sectionAPos = gl.getAttribLocation(sectionProgram, 'aPos');
    sectionAColor = gl.getAttribLocation(sectionProgram, 'aColor');
    
    console.log('sectionProgram 创建成功! aPos=' + sectionAPos + ', aColor=' + sectionAColor);
    return true;
}

initSectionProgram();

// GLSL 着色器源码 - 统一 Gizmo 渲染（圆环面 + 箭头）
const VS_GIZMO = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec4 aColor;
uniform mat4 uMVP;
varying vec3 vNormal;
varying vec4 vColor;
void main(){
    gl_Position = uMVP * vec4(aPos, 1.0);
    vNormal = aNormal;
    vColor = aColor;
}`;
const FS_GIZMO = `
precision mediump float;
varying vec3 vNormal;
varying vec4 vColor;
uniform vec3 uLightDir;
void main(){
    vec3 n = normalize(vNormal);
    float diff = max(dot(n, uLightDir), 0.0);
    // 补光：从反方向来的弱光
    vec3 lightDir2 = normalize(vec3(-0.3, -0.2, 0.5));
    float diff2 = max(dot(normalize(vNormal), lightDir2), 0.0) * 0.3;
    vec3 color = vColor.rgb * (0.5 + diff * 0.7 + diff2);
    gl_FragColor = vec4(color, 0.9);
}`;

const gizmoProgram = createProgram(gl, VS_GIZMO, FS_GIZMO);
if (!gizmoProgram) console.error('gizmoProgram 编译失败!');
const gizmoU_MVP = gl.getUniformLocation(gizmoProgram, 'uMVP');
const gizmoU_LightDir = gl.getUniformLocation(gizmoProgram, 'uLightDir');
const gizmoAPos = gl.getAttribLocation(gizmoProgram, 'aPos');
const gizmoANormal = gl.getAttribLocation(gizmoProgram, 'aNormal');
const gizmoAColor = gl.getAttribLocation(gizmoProgram, 'aColor');

// 线条程序 uniform/attribute 位置
const lineU_MVP = gl.getUniformLocation(lineProgram, 'uMVP');
const lineU_GridAlpha = gl.getUniformLocation(lineProgram, 'uGridAlpha');
const lineAPos = gl.getAttribLocation(lineProgram, 'aPos');
const lineAColor = gl.getAttribLocation(lineProgram, 'aColor');

// 网格程序 uniform/attribute 位置
const meshU_MVP = gl.getUniformLocation(meshProgram, 'uMVP');
const meshU_Model = gl.getUniformLocation(meshProgram, 'uModel');
const meshU_Color = gl.getUniformLocation(meshProgram, 'uColor');
const meshU_Ambient = gl.getUniformLocation(meshProgram, 'uAmbient');
const meshU_ClipEnabled = gl.getUniformLocation(meshProgram, 'uClipEnabled');
const meshU_ClipPlane = gl.getUniformLocation(meshProgram, 'uClipPlane');
const meshAPos = gl.getAttribLocation(meshProgram, 'aPos');
const meshANormal = gl.getAttribLocation(meshProgram, 'aNormal');

// 轮廓程序 uniform/attribute 位置
const outlineU_MVP = gl.getUniformLocation(outlineProgram, 'uMVP');
const outlineU_View = gl.getUniformLocation(outlineProgram, 'uView');
const outlineU_Model = gl.getUniformLocation(outlineProgram, 'uModel');
const outlineU_Width = gl.getUniformLocation(outlineProgram, 'uOutlineWidth');
const outlineAPos = gl.getAttribLocation(outlineProgram, 'aPos');
const outlineANormal = gl.getAttribLocation(outlineProgram, 'aNormal');

//3. 构建几何数据 (坐标轴 + 网格)
// 格式: [x,y,z, r,g,b,a, ...]
const verts = [];
function pushLine(x0,y0,z0, x1,y1,z1, r,g,b,a) {
    verts.push(x0,y0,z0,r,g,b,a, x1,y1,z1,r,g,b,a);
}

// 坐标轴 (长度5)
const L = 5;
pushLine(0,0,0, L,0,0, 1,0.27,0.27,1);   // X 红
pushLine(0,0,0, 0,L,0, 0.27,1,0.27,1);   // Y 绿
pushLine(0,0,0, 0,0,L, 0.27,0.53,1,1);   // Z 蓝

// 箭头锥体近似 (每轴8条线)
function pushCone(tx,ty,tz, dx,dy,dz, r,g,b) {
    const headLen = 0.5, headW = 0.18;
    const tipX=tx*dx, tipY=ty*dy, tipZ=tz*dz;
    const baseX=tipX-dx*headLen, baseY=tipY-dy*headLen, baseZ=tipZ-dz*headLen;
    // 找两个垂直于方向的向量
    let px=0,py=1,pz=0;
    if(Math.abs(dy)>0.9){px=1;py=0;pz=0;}
    // cross(dir, perp)
    let ux=dy*pz-dz*py, uy=dz*px-dx*pz, uz=dx*py-dy*px;
    let ul=Math.hypot(ux,uy,uz); ux/=ul; uy/=ul; uz/=ul;
    // cross(dir, u)
    let vx=dy*uz-dz*uy, vy=dz*ux-dx*uz, vz=dx*uy-dy*ux;
    for(let i=0;i<8;i++){
        const ang=i*Math.PI*2/8;
        const c=Math.cos(ang)*headW, s=Math.sin(ang)*headW;
        const bx=baseX+ux*c+vx*s, by=baseY+uy*c+vy*s, bz=baseZ+uz*c+vz*s;
        pushLine(tipX,tipY,tipZ, bx,by,bz, r,g,b,1);
    }
}
pushCone(L,0,0, 1,0,0, 1,0.27,0.27);
pushCone(0,L,0, 0,1,0, 0.27,1,0.27);
pushCone(0,0,L, 0,0,1, 0.27,0.53,1);

// 网格 (400x400, 间距1) - XY水平面(z=0)
const G = 200;
const gridStartIdx = verts.length;
for(let i=-G;i<=G;i++){
    const c = i===0 ? 0.3 : 0.15;
    pushLine(i,-G,0, i,G,0, c,c,0.27,1);
    pushLine(-G,i,0, G,i,0, c,c,0.27,1);
}
const gridEndIdx = verts.length;

const vertexData = new Float32Array(verts);
const vbo = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW);

const STRIDE = 7 * 4; // 7 floats per vertex
gl.enableVertexAttribArray(lineAPos);
gl.vertexAttribPointer(lineAPos, 3, gl.FLOAT, false, STRIDE, 0);
gl.enableVertexAttribArray(lineAColor);
gl.vertexAttribPointer(lineAColor, 4, gl.FLOAT, false, STRIDE, 12);

gl.enable(gl.DEPTH_TEST);
gl.clearColor(0.102, 0.102, 0.18, 1);
const totalVerts = vertexData.length / 7;

//4. 轨道控制器 (球面坐标 + 阻尼)
const state = {
    theta: Math.PI / 4,     // 水平角
    phi: Math.PI / 3,       // 垂直角
    radius: 14,
    targetTheta: Math.PI / 4,
    targetPhi: Math.PI / 3,
    targetRadius: 14,
    centerX: 0, centerY: 0, centerZ: 0,  // 视角中心点
    targetCenterX: 0, targetCenterY: 0, targetCenterZ: 0,
    damping: 0.08,
    dragging: false,
    panning: false,
    lastX: 0, lastY: 0
};

//鼠标中键(滚轮按下)拖动
canvas.addEventListener('mousedown', e => {
    if(e.button === 1) {  // 中键(滚轮)
        e.preventDefault();
        if(e.ctrlKey) {
            state.panning = true;  // Ctrl+滚轮 = 平移
        } else {
            state.dragging = true;  // 滚轮 = 旋转
        }
        state.lastX = e.clientX; 
        state.lastY = e.clientY;
    }
});

window.addEventListener('mouseup', e => { 
    if(e.button === 1) {
        state.dragging = false; 
        state.panning = false;
    }
});

window.addEventListener('mousemove', e => {
    if (state.dragging) {
        //旋转
        const dx = e.clientX - state.lastX;
        const dy = e.clientY - state.lastY;
        state.lastX = e.clientX; state.lastY = e.clientY;
        state.targetTheta -= dx * 0.005;
        state.targetPhi = Math.max(0.05, Math.min(Math.PI - 0.05, state.targetPhi - dy * 0.005));
    } else if (state.panning) {
        //平移
        const dx = e.clientX - state.lastX;
        const dy = e.clientY - state.lastY;
        state.lastX = e.clientX; state.lastY = e.clientY;
        
        //计算相机坐标系的右方向和上方向 (Z轴向上)
        const sp = Math.sin(state.phi);
        const cp = Math.cos(state.phi);
        const eye = [
            state.radius * sp * Math.cos(state.theta),
            state.radius * sp * Math.sin(state.theta),
            state.radius * cp
        ];
        
        //前方向 (eye -> center)
        const fwd = [-eye[0], -eye[1], -eye[2]];
        const fwdLen = Math.hypot(fwd[0], fwd[1], fwd[2]);
        fwd[0] /= fwdLen; fwd[1] /= fwdLen; fwd[2] /= fwdLen;
        
        //右方向 = forward × up(0,0,1)
        const right = [
            fwd[1] * 1 - fwd[2] * 0,
            fwd[2] * 0 - fwd[0] * 1,
            fwd[0] * 0 - fwd[1] * 0
        ];
        const rightLen = Math.hypot(right[0], right[1], right[2]);
        if(rightLen > 0.001) {
            right[0] /= rightLen; right[1] /= rightLen; right[2] /= rightLen;
        }
        
        //上方向 = right × forward
        const up = [
            right[1] * fwd[2] - right[2] * fwd[1],
            right[2] * fwd[0] - right[0] * fwd[2],
            right[0] * fwd[1] - right[1] * fwd[0]
        ];
        
        //平移速度与距离成正比
        //屏幕坐标系Y向下，世界坐标系Z向上，所以dy需要取反
        const panSpeed = state.radius * 0.002;
        state.targetCenterX -= (right[0] * dx - up[0] * dy) * panSpeed;
        state.targetCenterY -= (right[1] * dx - up[1] * dy) * panSpeed;
        state.targetCenterZ -= (right[2] * dx - up[2] * dy) * panSpeed;
    }
});

// 滚轮缩放
canvas.addEventListener('wheel', e => {
    e.preventDefault();
    state.targetRadius = Math.max(3, Math.min(50, state.targetRadius + e.deltaY * 0.01));
}, { passive: false });

// 触摸支持
canvas.addEventListener('touchstart', e => {
    if(e.touches.length===1){ state.dragging=true; state.lastX=e.touches[0].clientX; state.lastY=e.touches[0].clientY; }
}, {passive:false});
canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if(!state.dragging || e.touches.length!==1) return;
    const dx=e.touches[0].clientX-state.lastX, dy=e.touches[0].clientY-state.lastY;
    state.lastX=e.touches[0].clientX; state.lastY=e.touches[0].clientY;
    state.targetTheta-=dx*0.005;
    state.targetPhi=Math.max(0.05,Math.min(Math.PI-0.05,state.targetPhi-dy*0.005));
}, {passive:false});
canvas.addEventListener('touchend', ()=>{ state.dragging=false; });

//==================== 5. 渲染循环 ====================
const projMat = Mat4.create();
const viewMat = Mat4.create();
const mvpMat = Mat4.create();
const modelMat = Mat4.create();

function resize() {
    canvas.width = window.innerWidth * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
    gl.viewport(0, 0, canvas.width, canvas.height);
    Mat4.perspective(projMat, Math.PI / 4, canvas.width / canvas.height, 0.1, 200);
}
window.addEventListener('resize', resize);
resize();

//==================== 9. 三视图功能 ====================
let showThreeViews = false;
let showOutline = false;
let whiteBackground = false;
let sectionMode = false;
// 剖切平面状态
let sectionPlanePos = [0, 0, 0];  // 剖切平面中心位置（世界坐标）
let sectionPlaneNormal = [0, 0, 1];  // 剖切平面法向量（默认Z方向）
let sectionPlaneSize = 1;  // 剖切平面尺寸（自适应）
let draggingSection = false;
let dragSectionStartPos = null;
let dragSectionStartPlanePos = null;
let sectionPlaneHovered = false;  // 剖切平面悬停状态
const btnViews = document.getElementById('btnViews');
const btnOutline = document.getElementById('btnOutline');
const btnBg = document.getElementById('btnBg');
const viewFrontBg = document.getElementById('viewFrontBg');
const viewTopBg = document.getElementById('viewTopBg');
const viewLeftBg = document.getElementById('viewLeftBg');

btnViews.addEventListener('click', () => {
    showThreeViews = !showThreeViews;
    btnViews.classList.toggle('active', showThreeViews);
    viewFrontBg.classList.toggle('show', showThreeViews);
    viewTopBg.classList.toggle('show', showThreeViews);
    viewLeftBg.classList.toggle('show', showThreeViews);
});

btnOutline.addEventListener('click', () => {
    showOutline = !showOutline;
    btnOutline.classList.toggle('active', showOutline);
});

btnBg.addEventListener('click', () => {
    whiteBackground = !whiteBackground;
    btnBg.classList.toggle('active', whiteBackground);
    if (whiteBackground) {
        gl.clearColor(1.0, 1.0, 1.0, 1.0); // 白色背景
    } else {
        gl.clearColor(0.102, 0.102, 0.18, 1); // 原来的深色背景
    }
});

//==================== 9c. 刨面功能 ====================
const btnSection = document.getElementById('btnSection');
btnSection.addEventListener('click', () => {
    sectionMode = !sectionMode;
    btnSection.classList.toggle('active', sectionMode);
    if (sectionMode && meshData) {
        // 初始化剖切平面到零件几何中心
        sectionPlanePos = [meshPosition.x, meshPosition.y, meshPosition.z];
        sectionPlaneNormal = [0, 0, 1];
        // 自适应尺寸
        sectionPlaneSize = Math.max(meshData.bboxSize.x, meshData.bboxSize.y, meshData.bboxSize.z) * meshData.scale * 1.5;
    }
});

//==================== 9b. 零件颜色选择器 ====================
let meshColor = { r: 0.6, g: 0.7, b: 0.9 }; // 默认颜色
let colorPanelOpen = false;
let currentH = 220, currentS = 0.33, currentV = 0.9; // 默认 HSV

const btnColor = document.getElementById('btnColor');
const colorPanel = document.getElementById('colorPanel');
const spectrumCanvas = document.getElementById('spectrumCanvas');
const hueCanvas = document.getElementById('hueCanvas');
const spectrumIndicator = document.getElementById('spectrumIndicator');
const hueIndicator = document.getElementById('hueIndicator');
const inputR = document.getElementById('colorR');
const inputG = document.getElementById('colorG');
const inputB = document.getElementById('colorB');
const colorPreview = document.getElementById('colorPreview');
const btnColorClose = document.getElementById('btnColorClose');

function rgbToHsv(r, g, b) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, v = max;
    const d = max - min;
    s = max === 0 ? 0 : d / max;
    if (max === min) { h = 0; }
    else {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
    }
    return [h * 360, s, v];
}

function hsvToRgb(h, s, v) {
    h /= 360;
    let r, g, b;
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v; g = t; b = p; break;
        case 1: r = q; g = v; b = p; break;
        case 2: r = p; g = v; b = t; break;
        case 3: r = p; g = q; b = v; break;
        case 4: r = t; g = p; b = v; break;
        case 5: r = v; g = p; b = q; break;
    }
    return [r, g, b];
}

function drawSpectrum() {
    const ctx = spectrumCanvas.getContext('2d');
    const w = spectrumCanvas.width, h = spectrumCanvas.height;
    const imgData = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const s = x / (w - 1);
            const v = 1 - y / (h - 1);
            const [r, g, b] = hsvToRgb(currentH, s, v);
            const idx = (y * w + x) * 4;
            imgData.data[idx] = Math.round(r * 255);
            imgData.data[idx + 1] = Math.round(g * 255);
            imgData.data[idx + 2] = Math.round(b * 255);
            imgData.data[idx + 3] = 255;
        }
    }
    ctx.putImageData(imgData, 0, 0);
}

function drawHueBar() {
    const ctx = hueCanvas.getContext('2d');
    const w = hueCanvas.width, h = hueCanvas.height;
    const imgData = ctx.createImageData(w, h);
    for (let x = 0; x < w; x++) {
        const hue = x / (w - 1) * 360;
        const [r, g, b] = hsvToRgb(hue, 1, 1);
        for (let y = 0; y < h; y++) {
            const idx = (y * w + x) * 4;
            imgData.data[idx] = Math.round(r * 255);
            imgData.data[idx + 1] = Math.round(g * 255);
            imgData.data[idx + 2] = Math.round(b * 255);
            imgData.data[idx + 3] = 255;
        }
    }
    ctx.putImageData(imgData, 0, 0);
}

function updateSpectrumIndicator() {
    const x = currentS * 220;
    const y = (1 - currentV) * 200;
    spectrumIndicator.style.left = x + 'px';
    spectrumIndicator.style.top = y + 'px';
}

function updateHueIndicator() {
    const x = (currentH / 360) * 220;
    hueIndicator.style.left = x + 'px';
}

function updateRgbInputs() {
    const [r, g, b] = hsvToRgb(currentH, currentS, currentV);
    meshColor.r = r; meshColor.g = g; meshColor.b = b;
    inputR.value = Math.round(r * 255);
    inputG.value = Math.round(g * 255);
    inputB.value = Math.round(b * 255);
    colorPreview.style.background = `rgb(${Math.round(r*255)},${Math.round(g*255)},${Math.round(b*255)})`;
}

function applyColor() {
    updateRgbInputs();
}

// 初始化颜色面板
function initColorPanel() {
    const [h, s, v] = rgbToHsv(meshColor.r, meshColor.g, meshColor.b);
    currentH = h; currentS = s; currentV = v;
    drawSpectrum();
    drawHueBar();
    updateSpectrumIndicator();
    updateHueIndicator();
    updateRgbInputs();
}

btnColor.addEventListener('click', () => {
    colorPanelOpen = !colorPanelOpen;
    colorPanel.style.display = colorPanelOpen ? 'block' : 'none';
    btnColor.classList.toggle('active', colorPanelOpen);
    if (colorPanelOpen) initColorPanel();
});

btnColorClose.addEventListener('click', () => {
    colorPanelOpen = false;
    colorPanel.style.display = 'none';
    btnColor.classList.remove('active');
});

// 色谱点击/拖动
let spectrumDragging = false;
function handleSpectrumPick(e) {
    const rect = spectrumCanvas.getBoundingClientRect();
    const scaleX = spectrumCanvas.width / rect.width;
    const scaleY = spectrumCanvas.height / rect.height;
    const x = Math.max(0, Math.min(220, (e.clientX - rect.left) * scaleX));
    const y = Math.max(0, Math.min(200, (e.clientY - rect.top) * scaleY));
    currentS = x / 220;
    currentV = 1 - y / 200;
    updateSpectrumIndicator();
    applyColor();
}
spectrumCanvas.addEventListener('mousedown', e => { spectrumDragging = true; handleSpectrumPick(e); });
window.addEventListener('mousemove', e => { if (spectrumDragging) handleSpectrumPick(e); });
window.addEventListener('mouseup', () => { spectrumDragging = false; });

// 色相条点击/拖动
let hueDragging = false;
function handleHuePick(e) {
    const rect = hueCanvas.getBoundingClientRect();
    const scaleX = hueCanvas.width / rect.width;
    const x = Math.max(0, Math.min(220, (e.clientX - rect.left) * scaleX));
    currentH = (x / 220) * 360;
    drawSpectrum();
    updateHueIndicator();
    applyColor();
}
hueCanvas.addEventListener('mousedown', e => { hueDragging = true; handleHuePick(e); });
window.addEventListener('mousemove', e => { if (hueDragging) handleHuePick(e); });
window.addEventListener('mouseup', () => { hueDragging = false; });

// RGB 输入
function onRgbInput() {
    let r = Math.max(0, Math.min(255, parseInt(inputR.value) || 0));
    let g = Math.max(0, Math.min(255, parseInt(inputG.value) || 0));
    let b = Math.max(0, Math.min(255, parseInt(inputB.value) || 0));
    meshColor.r = r / 255; meshColor.g = g / 255; meshColor.b = b / 255;
    const [h, s, v] = rgbToHsv(meshColor.r, meshColor.g, meshColor.b);
    currentH = h; currentS = s; currentV = v;
    drawSpectrum();
    updateSpectrumIndicator();
    updateHueIndicator();
    colorPreview.style.background = `rgb(${r},${g},${b})`;
}
inputR.addEventListener('input', onRgbInput);
inputG.addEventListener('input', onRgbInput);
inputB.addEventListener('input', onRgbInput);

//==================== 10. 零件交互功能 ====================
let isHovering = false;      // 鼠标是否悬停在零件上
let isSelected = false;      // 零件是否被选中
let draggingGizmo = null;    // 正在拖拽的手柄轴: 'x', 'y', 'z', 'ringX', 'ringY', 'ringZ', 'arrowX', 'arrowY', 'arrowZ'
let dragStartPos = null;     // 拖拽开始位置
let dragStartRotation = { x: 0, y: 0, z: 0 };  // 拖拽开始时的旋转角度
let dragStartPosition = { x: 0, y: 0, z: 0 };    // 拖拽开始时的位置
let hoveredRing = null;      // 当前悬停的圆环: 'ringX', 'ringY', 'ringZ'
let hoveredArrow = null;     // 当前悬停的箭头: 'arrowX', 'arrowY', 'arrowZ'

// 零件的旋转和位置状态
let meshRotation = { x: 0, y: 0, z: 0 };  // 欧拉角（弧度）
let meshPosition = { x: 0, y: 0, z: 0 };  // 位置偏移

// 射线与三角形相交检测
function rayTriangleIntersect(rayOrigin, rayDir, v0, v1, v2) {
    const EPSILON = 0.0000001;
    const edge1 = [v1[0]-v0[0], v1[1]-v0[1], v1[2]-v0[2]];
    const edge2 = [v2[0]-v0[0], v2[1]-v0[1], v2[2]-v0[2]];
    const h = [rayDir[1]*edge2[2]-rayDir[2]*edge2[1],
               rayDir[2]*edge2[0]-rayDir[0]*edge2[2],
               rayDir[0]*edge2[1]-rayDir[1]*edge2[0]];
    const a = edge1[0]*h[0]+edge1[1]*h[1]+edge1[2]*h[2];
    if (a > -EPSILON && a < EPSILON) return null;
    const f = 1.0 / a;
    const s = [rayOrigin[0]-v0[0], rayOrigin[1]-v0[1], rayOrigin[2]-v0[2]];
    const u = f * (s[0]*h[0]+s[1]*h[1]+s[2]*h[2]);
    if (u < 0.0 || u > 1.0) return null;
    const q = [s[1]*edge1[2]-s[2]*edge1[1],
               s[2]*edge1[0]-s[0]*edge1[2],
               s[0]*edge1[1]-s[1]*edge1[0]];
    const v = f * (rayDir[0]*q[0]+rayDir[1]*q[1]+rayDir[2]*q[2]);
    if (v < 0.0 || u + v > 1.0) return null;
    const t = f * (edge2[0]*q[0]+edge2[1]*q[1]+edge2[2]*q[2]);
    if (t > EPSILON) return t;
    return null;
}

// 从屏幕坐标生成射线
function getRayFromMouse(mouseX, mouseY) {
    const rect = canvas.getBoundingClientRect();
    const x = ((mouseX - rect.left) / rect.width) * 2.0 - 1.0;
    const y = -((mouseY - rect.top) / rect.height) * 2.0 + 1.0;
    
    // 逆投影矩阵
    const invProj = Mat4.create();
    const invProjView = Mat4.create();
    
    // 简化：直接计算射线方向
    const sp = Math.sin(state.phi);
    const cp = Math.cos(state.phi);
    const eye = [
        state.centerX + state.radius * sp * Math.cos(state.theta),
        state.centerY + state.radius * sp * Math.sin(state.theta),
        state.centerZ + state.radius * cp
    ];
    
    // 相机坐标系
    const forward = [state.centerX-eye[0], state.centerY-eye[1], state.centerZ-eye[2]];
    const fLen = Math.hypot(forward[0], forward[1], forward[2]);
    forward[0]/=fLen; forward[1]/=fLen; forward[2]/=fLen;
    
    const up = [0, 0, 1];
    const right = [forward[1]*up[2]-forward[2]*up[1],
                   forward[2]*up[0]-forward[0]*up[2],
                   forward[0]*up[1]-forward[1]*up[0]];
    const rLen = Math.hypot(right[0], right[1], right[2]);
    right[0]/=rLen; right[1]/=rLen; right[2]/=rLen;
    
    const camUp = [right[1]*forward[2]-right[2]*forward[1],
                   right[2]*forward[0]-right[0]*forward[2],
                   right[0]*forward[1]-right[1]*forward[0]];
    
    // 射线方向
    const aspect = canvas.width / canvas.height;
    const fov = Math.PI / 4;
    const scale = Math.tan(fov / 2);
    
    const rayDir = [
        forward[0] + right[0] * x * scale * aspect + camUp[0] * y * scale,
        forward[1] + right[1] * x * scale * aspect + camUp[1] * y * scale,
        forward[2] + right[2] * x * scale * aspect + camUp[2] * y * scale
    ];
    const dLen = Math.hypot(rayDir[0], rayDir[1], rayDir[2]);
    rayDir[0]/=dLen; rayDir[1]/=dLen; rayDir[2]/=dLen;
    
    return { origin: eye, dir: rayDir };
}

// 检测射线与网格相交
function checkMeshIntersection(mouseX, mouseY) {
    if (!meshData || !meshData.rawVertices) return false;
    
    const ray = getRayFromMouse(mouseX, mouseY);
    const scale = meshData.scale;
    const ox = meshData.offsetX * scale;
    const oy = meshData.offsetY * scale;
    const oz = meshData.offsetZ * scale;
    
    // 旋转矩阵 R = Rz * Ry * Rx
    const rx = meshRotation.x, ry = meshRotation.y, rz = meshRotation.z;
    const crx = Math.cos(rx), srx = Math.sin(rx);
    const cry = Math.cos(ry), sry = Math.sin(ry);
    const crz = Math.cos(rz), srz = Math.sin(rz);
    const r00 = cry*crz, r01 = srx*sry*crz-crx*srz, r02 = crx*sry*crz+srx*srz;
    const r10 = cry*srz, r11 = srx*sry*srz+crx*crz, r12 = crx*sry*srz-srx*crz;
    const r20 = -sry,    r21 = srx*cry,           r22 = crx*cry;
    
    const tx = ox + meshPosition.x;
    const ty = oy + meshPosition.y;
    const tz = oz + meshPosition.z;
    
    // 遍历所有三角形
    for (let i = 0; i < meshData.rawVertices.length; i += 9) {
        // 原始顶点（局部空间）
        const lx0 = meshData.rawVertices[i]*scale;
        const ly0 = meshData.rawVertices[i+1]*scale;
        const lz0 = meshData.rawVertices[i+2]*scale;
        const lx1 = meshData.rawVertices[i+3]*scale;
        const ly1 = meshData.rawVertices[i+4]*scale;
        const lz1 = meshData.rawVertices[i+5]*scale;
        const lx2 = meshData.rawVertices[i+6]*scale;
        const ly2 = meshData.rawVertices[i+7]*scale;
        const lz2 = meshData.rawVertices[i+8]*scale;
        
        // 应用旋转和平移
        const v0 = [r00*lx0 + r01*ly0 + r02*lz0 + tx,
                    r10*lx0 + r11*ly0 + r12*lz0 + ty,
                    r20*lx0 + r21*ly0 + r22*lz0 + tz];
        const v1 = [r00*lx1 + r01*ly1 + r02*lz1 + tx,
                    r10*lx1 + r11*ly1 + r12*lz1 + ty,
                    r20*lx1 + r21*ly1 + r22*lz1 + tz];
        const v2 = [r00*lx2 + r01*ly2 + r02*lz2 + tx,
                    r10*lx2 + r11*ly2 + r12*lz2 + ty,
                    r20*lx2 + r21*ly2 + r22*lz2 + tz];
        
        if (rayTriangleIntersect(ray.origin, ray.dir, v0, v1, v2)) {
            return true;
        }
    }
    return false;
}

// 鼠标移动事件（悬停检测）
canvas.addEventListener('mousemove', e => {
    if (draggingGizmo || draggingSection) return;  // 拖拽时不检测悬停
    
    // 刨面模式下检测平面悬停
    if (sectionMode && meshData) {
        const wasSectionPlaneHovered = sectionPlaneHovered;
        sectionPlaneHovered = checkSectionPlaneHover(e.clientX, e.clientY);
        
        if (sectionPlaneHovered) {
            if (sectionPlaneHovered !== wasSectionPlaneHovered) {
                canvas.style.cursor = 'pointer';
            }
            return;
        }
        sectionPlaneHovered = false;
    }
    
    const wasHovering = isHovering;
    isHovering = checkMeshIntersection(e.clientX, e.clientY);
    
    // 检测圆环悬停
    const wasHoveredRing = hoveredRing;
    hoveredRing = checkRingHover(e.clientX, e.clientY);
    
    // 检测箭头悬停
    const wasHoveredArrow = hoveredArrow;
    hoveredArrow = checkArrowHover(e.clientX, e.clientY);
    
    if (isHovering !== wasHovering || hoveredRing !== wasHoveredRing || hoveredArrow !== wasHoveredArrow) {
        canvas.style.cursor = (isHovering || hoveredRing || hoveredArrow) ? 'pointer' : 'default';
    }
});

// 鼠标点击事件（选中/取消选中）
canvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return;  // 只处理左键
    
    // 优先检测剖切平面
    if (sectionMode && meshData) {
        const sectionHit = checkSectionPlaneHover(e.clientX, e.clientY);
        if (sectionHit) {
            draggingSection = true;
            dragSectionStartPos = { x: e.clientX, y: e.clientY };
            dragSectionStartPlanePos = [...sectionPlanePos];
            e.preventDefault();
            return;
        }
    }
    
    if (isSelected) {
        // 已选中：优先检测手柄（箭头紧贴零件，必须先检测手柄）
        const gizmoHit = checkGizmoIntersection(e.clientX, e.clientY);
        if (gizmoHit) {
            draggingGizmo = gizmoHit;
            dragStartPos = { x: e.clientX, y: e.clientY };
            dragStartRotation = { ...meshRotation };
            dragStartPosition = { ...meshPosition };
            e.preventDefault();
            return;
        }
        // 未点击手柄：检测是否点击了零件
        const meshHit = checkMeshIntersection(e.clientX, e.clientY);
        if (meshHit) {
            // 点击零件保持选中状态
            return;
        }
        // 点击空白区域取消选中
        isSelected = false;
        draggingGizmo = null;
    } else {
        // 未选中：检测是否点击了零件
        if (checkMeshIntersection(e.clientX, e.clientY)) {
            isSelected = true;
        }
    }
});

// 鼠标释放事件
window.addEventListener('mouseup', e => {
    if (draggingGizmo) {
        draggingGizmo = null;
        dragStartPos = null;
    }
    if (draggingSection) {
        draggingSection = false;
        dragSectionStartPos = null;
        dragSectionStartPlanePos = null;
    }
});

// 拖拽手柄时更新旋转/位置
window.addEventListener('mousemove', e => {
    // 剖切平面拖拽
    if (draggingSection && dragSectionStartPos && dragSectionStartPlanePos) {
        const planeNormal = sectionPlaneNormal;
        
        // 计算相机方向
        const sp = Math.sin(state.phi), cp = Math.cos(state.phi);
        const eye = [
            state.centerX + state.radius * sp * Math.cos(state.theta),
            state.centerY + state.radius * sp * Math.sin(state.theta),
            state.centerZ + state.radius * cp
        ];
        const fwd = [state.centerX - eye[0], state.centerY - eye[1], state.centerZ - eye[2]];
        const fwdLen = Math.hypot(fwd[0], fwd[1], fwd[2]);
        fwd[0] /= fwdLen; fwd[1] /= fwdLen; fwd[2] /= fwdLen;
        
        // 相机方向与法向量的点积
        const camDotNormal = fwd[0]*planeNormal[0] + fwd[1]*planeNormal[1] + fwd[2]*planeNormal[2];
        const absDot = Math.abs(camDotNormal);
        
        if (absDot > 0.7) {
            // 相机方向接近平行于法向量（俯视/仰视）
            // 使用屏幕Y位移作为法向移动量
            const dy = e.clientY - dragSectionStartPos.y;
            const fov = Math.PI / 4;
            const pxToWorld = 2 * state.radius * Math.tan(fov / 2) / canvas.height;
            // 屏幕Y向下为正，相机俯视时向下拖拽应使刨面向相机方向移动（即沿法向量反方向）
            const sign = camDotNormal > 0 ? -1 : 1;
            const projection = dy * pxToWorld * sign;
            
            sectionPlanePos[0] = dragSectionStartPlanePos[0] + projection * planeNormal[0];
            sectionPlanePos[1] = dragSectionStartPlanePos[1] + projection * planeNormal[1];
            sectionPlanePos[2] = dragSectionStartPlanePos[2] + projection * planeNormal[2];
        } else {
            // 一般情况：使用射线-参考平面相交法
            const startRay = getRayFromMouse(dragSectionStartPos.x, dragSectionStartPos.y);
            const currentRay = getRayFromMouse(e.clientX, e.clientY);
            
            // 参考平面：通过起始点，法向量为相机方向
            const refNormal = fwd;
            
            function rayPlaneIntersect(origin, dir, point, normal) {
                const denom = dir[0]*normal[0] + dir[1]*normal[1] + dir[2]*normal[2];
                if (Math.abs(denom) < 1e-6) return null;
                const t = ((point[0]-origin[0])*normal[0] + (point[1]-origin[1])*normal[1] + (point[2]-origin[2])*normal[2]) / denom;
                if (t < 0) return null;
                return [origin[0]+dir[0]*t, origin[1]+dir[1]*t, origin[2]+dir[2]*t];
            }
            
            const startHit = rayPlaneIntersect(startRay.origin, startRay.dir, dragSectionStartPlanePos, refNormal);
            const currentHit = rayPlaneIntersect(currentRay.origin, currentRay.dir, dragSectionStartPlanePos, refNormal);
            
            if (startHit && currentHit) {
                const dx = currentHit[0] - startHit[0];
                const dy = currentHit[1] - startHit[1];
                const dz = currentHit[2] - startHit[2];
                const projection = dx*planeNormal[0] + dy*planeNormal[1] + dz*planeNormal[2];
                
                sectionPlanePos[0] = dragSectionStartPlanePos[0] + projection * planeNormal[0];
                sectionPlanePos[1] = dragSectionStartPlanePos[1] + projection * planeNormal[1];
                sectionPlanePos[2] = dragSectionStartPlanePos[2] + projection * planeNormal[2];
            }
        }
        return;
    }
    
    if (!draggingGizmo || !dragStartPos) return;
    
    if (draggingGizmo === 'ringX') {
        // 绕X轴旋转
        const dy = e.clientY - dragStartPos.y;
        meshRotation.x = dragStartRotation.x + dy * 0.01;
    } else if (draggingGizmo === 'ringY') {
        // 绕Y轴旋转（取反以匹配视觉方向）
        const dy = e.clientY - dragStartPos.y;
        meshRotation.y = dragStartRotation.y - dy * 0.01;
    } else if (draggingGizmo === 'ringZ') {
        // 绕Z轴旋转
        const dx = e.clientX - dragStartPos.x;
        meshRotation.z = dragStartRotation.z + dx * 0.01;
    } else if (draggingGizmo === 'x' || draggingGizmo === 'y' || draggingGizmo === 'z' ||
               draggingGizmo === 'arrowX' || draggingGizmo === 'arrowY' || draggingGizmo === 'arrowZ') {
        // 使用射线-平面交点计算沿轴移动
        const currentRay = getRayFromMouse(e.clientX, e.clientY);
        const startRay = getRayFromMouse(dragStartPos.x, dragStartPos.y);
        
        // 获取当前旋转矩阵的列向量（轴方向）
        const rx = meshRotation.x, ry = meshRotation.y, rz = meshRotation.z;
        const crx = Math.cos(rx), srx = Math.sin(rx);
        const cry = Math.cos(ry), sry = Math.sin(ry);
        const crz = Math.cos(rz), srz = Math.sin(rz);
        const r00 = cry*crz, r01 = srx*sry*crz-crx*srz, r02 = crx*sry*crz+srx*srz;
        const r10 = cry*srz, r11 = srx*sry*srz+crx*crz, r12 = crx*sry*srz-srx*crz;
        const r20 = -sry,    r21 = srx*cry,           r22 = crx*cry;
        
        let axisDir;
        if (draggingGizmo === 'x' || draggingGizmo === 'arrowX') axisDir = [r00, r10, r20];
        else if (draggingGizmo === 'y' || draggingGizmo === 'arrowY') axisDir = [r01, r11, r21];
        else axisDir = [r02, r12, r22];
        
        // 计算射线与通过几何中心、垂直于视线的平面的交点
        // 然后投影到轴方向上
        const center = [meshPosition.x, meshPosition.y, meshPosition.z];
        
        // 获取当前视图的右方向和上方向（用于构建平面）
        const sp = Math.sin(state.phi);
        const cp = Math.cos(state.phi);
        const eye = [
            state.centerX + state.radius * sp * Math.cos(state.theta),
            state.centerY + state.radius * sp * Math.sin(state.theta),
            state.centerZ + state.radius * cp
        ];
        const viewDir = [center[0]-eye[0], center[1]-eye[1], center[2]-eye[2]];
        const viewLen = Math.hypot(viewDir[0], viewDir[1], viewDir[2]);
        viewDir[0]/=viewLen; viewDir[1]/=viewLen; viewDir[2]/=viewLen;
        
        // 平面法向量 = 视线方向
        const planeNormal = viewDir;
        
        // 射线与平面交点：t = (planePoint - rayOrigin) · planeNormal / (rayDir · planeNormal)
        function rayPlaneIntersection(rayOrigin, rayDir, planePoint, planeNormal) {
            const denom = rayDir[0]*planeNormal[0] + rayDir[1]*planeNormal[1] + rayDir[2]*planeNormal[2];
            if (Math.abs(denom) < 1e-6) return null;
            const t = ((planePoint[0]-rayOrigin[0])*planeNormal[0] + 
                       (planePoint[1]-rayOrigin[1])*planeNormal[1] + 
                       (planePoint[2]-rayOrigin[2])*planeNormal[2]) / denom;
            return [rayOrigin[0]+rayDir[0]*t, rayOrigin[1]+rayDir[1]*t, rayOrigin[2]+rayDir[2]*t];
        }
        
        const startHit = rayPlaneIntersection(startRay.origin, startRay.dir, center, planeNormal);
        const currentHit = rayPlaneIntersection(currentRay.origin, currentRay.dir, center, planeNormal);
        
        if (startHit && currentHit) {
            // 计算沿轴方向的位移
            const displacement = [currentHit[0]-startHit[0], currentHit[1]-startHit[1], currentHit[2]-startHit[2]];
            const axisProjection = displacement[0]*axisDir[0] + displacement[1]*axisDir[1] + displacement[2]*axisDir[2];
            
            meshPosition.x = dragStartPosition.x + axisProjection * axisDir[0];
            meshPosition.y = dragStartPosition.y + axisProjection * axisDir[1];
            meshPosition.z = dragStartPosition.z + axisProjection * axisDir[2];
        }
    }
});

// 检测圆环悬停
function checkRingHover(mouseX, mouseY) {
    if (!meshData || !isSelected) return null;
    
    const ray = getRayFromMouse(mouseX, mouseY);
    
    // 几何中心
    const center = [meshPosition.x, meshPosition.y, meshPosition.z];
    
    const rx = meshRotation.x, ry = meshRotation.y, rz = meshRotation.z;
    const crx = Math.cos(rx), srx = Math.sin(rx);
    const cry = Math.cos(ry), sry = Math.sin(ry);
    const crz = Math.cos(rz), srz = Math.sin(rz);
    const r00 = cry*crz, r01 = srx*sry*crz-crx*srz, r02 = crx*sry*crz+srx*srz;
    const r10 = cry*srz, r11 = srx*sry*srz+crx*crz, r12 = crx*sry*srz-srx*crz;
    const r20 = -sry,    r21 = srx*cry,           r22 = crx*cry;
    
    // 手柄半径（与 renderGizmo 一致）
    const partRadius = meshData.maxDist;
    const gizmoRadius = partRadius * 1.4;
    const ringThickness = gizmoRadius * 0.06;  // 宽度减半
    const outerR = gizmoRadius + ringThickness;
    const innerR = gizmoRadius - ringThickness;
    
    // 射线与平面交点
    function rayPlaneIntersection(rayOrigin, rayDir, planePoint, planeNormal) {
        const denom = rayDir[0]*planeNormal[0] + rayDir[1]*planeNormal[1] + rayDir[2]*planeNormal[2];
        if (Math.abs(denom) < 1e-6) return null;
        const t = ((planePoint[0]-rayOrigin[0])*planeNormal[0] + 
                   (planePoint[1]-rayOrigin[1])*planeNormal[1] + 
                   (planePoint[2]-rayOrigin[2])*planeNormal[2]) / denom;
        if (t < 0) return null;  // 射线方向相反
        return [rayOrigin[0]+rayDir[0]*t, rayOrigin[1]+rayDir[1]*t, rayOrigin[2]+rayDir[2]*t];
    }
    
    // 检查射线与三个圆环平面的交点
    const rings = [
        { name: 'ringX', normal: [r00, r10, r20] },
        { name: 'ringY', normal: [r01, r11, r21] },
        { name: 'ringZ', normal: [r02, r12, r22] }
    ];
    
    for (const ring of rings) {
        const hit = rayPlaneIntersection(ray.origin, ray.dir, center, ring.normal);
        if (hit) {
            // 计算交点到中心的距离
            const dx = hit[0] - center[0];
            const dy = hit[1] - center[1];
            const dz = hit[2] - center[2];
            const dist = Math.hypot(dx, dy, dz);
            
            // 检查是否在圆环内（内半径和外半径之间）
            if (dist >= innerR && dist <= outerR) {
                return ring.name;
            }
        }
    }
    
    return null;
}

// 检测箭头悬停 - 使用射线-四边形相交检测
function checkArrowHover(mouseX, mouseY) {
    if (!meshData || !isSelected) return null;
    
    const ray = getRayFromMouse(mouseX, mouseY);
    
    // 几何中心
    const center = [meshPosition.x, meshPosition.y, meshPosition.z];
    
    const rx = meshRotation.x, ry = meshRotation.y, rz = meshRotation.z;
    const crx = Math.cos(rx), srx = Math.sin(rx);
    const cry = Math.cos(ry), sry = Math.sin(ry);
    const crz = Math.cos(rz), srz = Math.sin(rz);
    const r00 = cry*crz, r01 = srx*sry*crz-crx*srz, r02 = crx*sry*crz+srx*srz;
    const r10 = cry*srz, r11 = srx*sry*srz+crx*crz, r12 = crx*sry*srz-srx*crz;
    const r20 = -sry,    r21 = srx*cry,           r22 = crx*cry;
    
    // 手柄半径（与 renderGizmo 一致）
    const partRadius = meshData.maxDist;
    const gizmoRadius = partRadius * 1.4;
    const arrowLength = partRadius * 2.0;  // 与 renderGizmo 一致
    const arrowWidth = gizmoRadius * 0.025;  // 与 renderGizmo 一致
    const arrowHeadLength = arrowWidth * 4;
    const arrowHeadWidth = arrowWidth * 2.5;
    
    // 计算视图方向（billboard箭头的法向量）
    const sp = Math.sin(state.phi);
    const cp = Math.cos(state.phi);
    const eyeX = state.centerX + state.radius * sp * Math.cos(state.theta);
    const eyeY = state.centerY + state.radius * sp * Math.sin(state.theta);
    const eyeZ = state.centerZ + state.radius * cp;
    const viewDirX = center[0] - eyeX, viewDirY = center[1] - eyeY, viewDirZ = center[2] - eyeZ;
    const viewLen = Math.hypot(viewDirX, viewDirY, viewDirZ);
    const normViewX = viewDirX/viewLen, normViewY = viewDirY/viewLen, normViewZ = viewDirZ/viewLen;
    
    // 检测每个箭头（billboard四边形）
    const axes = [
        { name: 'arrowX', dir: [r00, r10, r20] },
        { name: 'arrowY', dir: [r01, r11, r21] },
        { name: 'arrowZ', dir: [r02, r12, r22] }
    ];
    
    for (const axis of axes) {
        // 计算垂直于箭头方向和视图方向的向量（作为箭头的"宽度"方向）
        let wX = axis.dir[1] * normViewZ - axis.dir[2] * normViewY;
        let wY = axis.dir[2] * normViewX - axis.dir[0] * normViewZ;
        let wZ = axis.dir[0] * normViewY - axis.dir[1] * normViewX;
        const wLen = Math.hypot(wX, wY, wZ);
        if (wLen < 0.001) {
            wX = axis.dir[1] * 0 - axis.dir[2] * 1;
            wY = axis.dir[2] * 1 - axis.dir[0] * 0;
            wZ = axis.dir[0] * 0 - axis.dir[1] * 1;
            const wl = Math.hypot(wX, wY, wZ);
            wX /= wl; wY /= wl; wZ /= wl;
        } else {
            wX /= wLen; wY /= wLen; wZ /= wLen;
        }
        
        const shaftLen = arrowLength - arrowHeadLength;
        
        // 箭头杆四边形的四个角点
        const baseL = [center[0] - wX*arrowWidth, center[1] - wY*arrowWidth, center[2] - wZ*arrowWidth];
        const baseR = [center[0] + wX*arrowWidth, center[1] + wY*arrowWidth, center[2] + wZ*arrowWidth];
        const shaftEndL = [center[0] + axis.dir[0]*shaftLen - wX*arrowWidth, center[1] + axis.dir[1]*shaftLen - wY*arrowWidth, center[2] + axis.dir[2]*shaftLen - wZ*arrowWidth];
        const shaftEndR = [center[0] + axis.dir[0]*shaftLen + wX*arrowWidth, center[1] + axis.dir[1]*shaftLen + wY*arrowWidth, center[2] + axis.dir[2]*shaftLen + wZ*arrowWidth];
        
        // 箭头头部三角形
        const tipX = center[0] + axis.dir[0] * arrowLength;
        const tipY = center[1] + axis.dir[1] * arrowLength;
        const tipZ = center[2] + axis.dir[2] * arrowLength;
        const headBaseL = [center[0] + axis.dir[0]*shaftLen - wX*arrowHeadWidth, center[1] + axis.dir[1]*shaftLen - wY*arrowHeadWidth, center[2] + axis.dir[2]*shaftLen - wZ*arrowHeadWidth];
        const headBaseR = [center[0] + axis.dir[0]*shaftLen + wX*arrowHeadWidth, center[1] + axis.dir[1]*shaftLen + wY*arrowHeadWidth, center[2] + axis.dir[2]*shaftLen + wZ*arrowHeadWidth];
        
        // 检测射线与箭头杆四边形的相交
        if (rayQuadIntersect(ray.origin, ray.dir, baseL, baseR, shaftEndR, shaftEndL)) return axis.name;
        // 检测射线与箭头头部三角形的相交
        if (rayTriangleIntersect(ray.origin, ray.dir, headBaseL, headBaseR, [tipX, tipY, tipZ])) return axis.name;
    }
    
    return null;
}

// 射线-四边形相交检测
function rayQuadIntersect(rayOrigin, rayDir, p0, p1, p2, p3) {
    // 四边形由两个三角形组成：p0-p1-p2 和 p0-p2-p3
    return rayTriangleIntersect(rayOrigin, rayDir, p0, p1, p2) || 
           rayTriangleIntersect(rayOrigin, rayDir, p0, p2, p3);
}

// 射线-三角形相交检测（Möller-Trumbore算法）
function rayTriangleIntersect(rayOrigin, rayDir, v0, v1, v2) {
    const EPSILON = 0.000001;
    const edge1 = [v1[0]-v0[0], v1[1]-v0[1], v1[2]-v0[2]];
    const edge2 = [v2[0]-v0[0], v2[1]-v0[1], v2[2]-v0[2]];
    const h = [rayDir[1]*edge2[2]-rayDir[2]*edge2[1], rayDir[2]*edge2[0]-rayDir[0]*edge2[2], rayDir[0]*edge2[1]-rayDir[1]*edge2[0]];
    const a = edge1[0]*h[0]+edge1[1]*h[1]+edge1[2]*h[2];
    if (a > -EPSILON && a < EPSILON) return false;
    const f = 1.0/a;
    const s = [rayOrigin[0]-v0[0], rayOrigin[1]-v0[1], rayOrigin[2]-v0[2]];
    const u = f*(s[0]*h[0]+s[1]*h[1]+s[2]*h[2]);
    if (u < 0.0 || u > 1.0) return false;
    const q = [s[1]*edge1[2]-s[2]*edge1[1], s[2]*edge1[0]-s[0]*edge1[2], s[0]*edge1[1]-s[1]*edge1[0]];
    const v = f*(rayDir[0]*q[0]+rayDir[1]*q[1]+rayDir[2]*q[2]);
    if (v < 0.0 || u+v > 1.0) return false;
    const t = f*(edge2[0]*q[0]+edge2[1]*q[1]+edge2[2]*q[2]);
    return t > EPSILON;
}

// 检测鼠标是否在剖切平面上（射线-平面相交）
function checkSectionPlaneHover(mouseX, mouseY) {
    if (!sectionMode || !meshData) {
        console.log('[Plane] skip: sectionMode=' + sectionMode + ' meshData=' + !!meshData);
        return false;
    }
    
    const ray = getRayFromMouse(mouseX, mouseY);
    const pos = sectionPlanePos;
    const normal = sectionPlaneNormal;
    const size = sectionPlaneSize;
    
    // 射线与平面相交
    const denom = ray.dir[0]*normal[0] + ray.dir[1]*normal[1] + ray.dir[2]*normal[2];
    if (Math.abs(denom) < 1e-6) return false;
    
    const t = ((pos[0]-ray.origin[0])*normal[0] + 
               (pos[1]-ray.origin[1])*normal[1] + 
               (pos[2]-ray.origin[2])*normal[2]) / denom;
    
    if (t < 0) return false;
    
    // 交点
    const hitX = ray.origin[0] + ray.dir[0]*t;
    const hitY = ray.origin[1] + ray.dir[1]*t;
    const hitZ = ray.origin[2] + ray.dir[2]*t;
    
    // 计算切向量（与渲染一致）
    let t1x, t1y, t1z, t2x, t2y, t2z;
    if (Math.abs(normal[2]) > 0.9) {
        t1x = 1; t1y = 0; t1z = 0;
    } else {
        t1x = normal[1]; t1y = -normal[0]; t1z = 0;
        const l1 = Math.hypot(t1x, t1y, t1z);
        t1x /= l1; t1y /= l1; t1z /= l1;
    }
    t2x = normal[1]*t1z - normal[2]*t1y;
    t2y = normal[2]*t1x - normal[0]*t1z;
    t2z = normal[0]*t1y - normal[1]*t1x;
    const l2 = Math.hypot(t2x, t2y, t2z);
    t2x /= l2; t2y /= l2; t2z /= l2;
    
    // 检查交点是否在矩形范围内
    const dx = hitX - pos[0], dy = hitY - pos[1], dz = hitZ - pos[2];
    const u = dx*t1x + dy*t1y + dz*t1z;
    const v = dx*t2x + dy*t2y + dz*t2z;
    const half = size / 2;
    
    const inBounds = Math.abs(u) <= half && Math.abs(v) <= half;
    console.log('[Plane] t=' + t.toFixed(3) + ' size=' + size.toFixed(3) + ' u=' + u.toFixed(3) + ' v=' + v.toFixed(3) + ' half=' + half.toFixed(3) + ' inBounds=' + inBounds);
    return inBounds;
}

// 检测是否点击了变换手柄
function checkGizmoIntersection(mouseX, mouseY) {
    if (!meshData) return null;
    
    const ray = getRayFromMouse(mouseX, mouseY);
    
    // 几何中心与 renderGizmo 一致
    const center = [meshPosition.x, meshPosition.y, meshPosition.z];
    
    const rx = meshRotation.x, ry = meshRotation.y, rz = meshRotation.z;
    const crx = Math.cos(rx), srx = Math.sin(rx);
    const cry = Math.cos(ry), sry = Math.sin(ry);
    const crz = Math.cos(rz), srz = Math.sin(rz);
    const r00 = cry*crz, r01 = srx*sry*crz-crx*srz, r02 = crx*sry*crz+srx*srz;
    const r10 = cry*srz, r11 = srx*sry*srz+crx*crz, r12 = crx*sry*srz-srx*crz;
    const r20 = -sry,    r21 = srx*cry,           r22 = crx*cry;
    
    // 手柄半径（与 renderGizmo 一致）
    const partRadius = meshData.maxDist;
    const gizmoRadius = partRadius * 1.4;
    const ringThickness = gizmoRadius * 0.06;  // 宽度减半
    const arrowLength = partRadius * 2.0;  // 与 renderGizmo 一致
    const arrowWidth = gizmoRadius * 0.025;  // 与 renderGizmo 一致
    const arrowHeadLength = arrowWidth * 4;
    const arrowHeadWidth = arrowWidth * 2.5;  // 与 renderGizmo 一致
    
    // 计算视图方向（billboard箭头的法向量）
    const sp = Math.sin(state.phi);
    const cp = Math.cos(state.phi);
    const eyeX = state.centerX + state.radius * sp * Math.cos(state.theta);
    const eyeY = state.centerY + state.radius * sp * Math.sin(state.theta);
    const eyeZ = state.centerZ + state.radius * cp;
    const viewDirX = center[0] - eyeX, viewDirY = center[1] - eyeY, viewDirZ = center[2] - eyeZ;
    const viewLen = Math.hypot(viewDirX, viewDirY, viewDirZ);
    const normViewX = viewDirX/viewLen, normViewY = viewDirY/viewLen, normViewZ = viewDirZ/viewLen;
    
    // 旋转后的坐标轴方向（R的列向量）
    const xAxisDir = [r00, r10, r20];
    const yAxisDir = [r01, r11, r21];
    const zAxisDir = [r02, r12, r22];
    
    // 检测箭头（优先检测，使用射线-四边形相交）
    const arrows = [
        { name: 'arrowX', dir: xAxisDir },
        { name: 'arrowY', dir: yAxisDir },
        { name: 'arrowZ', dir: zAxisDir }
    ];
    
    for (const arrow of arrows) {
        // 计算垂直于箭头方向和视图方向的向量（作为箭头的"宽度"方向）
        let wX = arrow.dir[1] * normViewZ - arrow.dir[2] * normViewY;
        let wY = arrow.dir[2] * normViewX - arrow.dir[0] * normViewZ;
        let wZ = arrow.dir[0] * normViewY - arrow.dir[1] * normViewX;
        const wLen = Math.hypot(wX, wY, wZ);
        if (wLen < 0.001) {
            wX = arrow.dir[1] * 0 - arrow.dir[2] * 1;
            wY = arrow.dir[2] * 1 - arrow.dir[0] * 0;
            wZ = arrow.dir[0] * 0 - arrow.dir[1] * 1;
            const wl = Math.hypot(wX, wY, wZ);
            wX /= wl; wY /= wl; wZ /= wl;
        } else {
            wX /= wLen; wY /= wLen; wZ /= wLen;
        }
        
        const shaftLen = arrowLength - arrowHeadLength;
        
        // 箭头杆四边形的四个角点
        const baseL = [center[0] - wX*arrowWidth, center[1] - wY*arrowWidth, center[2] - wZ*arrowWidth];
        const baseR = [center[0] + wX*arrowWidth, center[1] + wY*arrowWidth, center[2] + wZ*arrowWidth];
        const shaftEndL = [center[0] + arrow.dir[0]*shaftLen - wX*arrowWidth, center[1] + arrow.dir[1]*shaftLen - wY*arrowWidth, center[2] + arrow.dir[2]*shaftLen - wZ*arrowWidth];
        const shaftEndR = [center[0] + arrow.dir[0]*shaftLen + wX*arrowWidth, center[1] + arrow.dir[1]*shaftLen + wY*arrowWidth, center[2] + arrow.dir[2]*shaftLen + wZ*arrowWidth];
        
        // 箭头头部三角形
        const tipX = center[0] + arrow.dir[0] * arrowLength;
        const tipY = center[1] + arrow.dir[1] * arrowLength;
        const tipZ = center[2] + arrow.dir[2] * arrowLength;
        const headBaseL = [center[0] + arrow.dir[0]*shaftLen - wX*arrowHeadWidth, center[1] + arrow.dir[1]*shaftLen - wY*arrowHeadWidth, center[2] + arrow.dir[2]*shaftLen - wZ*arrowHeadWidth];
        const headBaseR = [center[0] + arrow.dir[0]*shaftLen + wX*arrowHeadWidth, center[1] + arrow.dir[1]*shaftLen + wY*arrowHeadWidth, center[2] + arrow.dir[2]*shaftLen + wZ*arrowHeadWidth];
        
        // 检测射线与箭头杆四边形的相交
        if (rayQuadIntersect(ray.origin, ray.dir, baseL, baseR, shaftEndR, shaftEndL)) return arrow.name;
        // 检测射线与箭头头部三角形的相交
        if (rayTriangleIntersect(ray.origin, ray.dir, headBaseL, headBaseR, [tipX, tipY, tipZ])) return arrow.name;
    }
    
    // 检测旋转环
    const rings = [
        { name: 'ringX', normal: xAxisDir },
        { name: 'ringY', normal: yAxisDir },
        { name: 'ringZ', normal: zAxisDir }
    ];
    
    // 将屏幕像素容差转换为世界空间距离
    const camDist = Math.hypot(
        meshPosition.x - (state.centerX + state.radius * Math.sin(state.phi) * Math.cos(state.theta)),
        meshPosition.y - (state.centerY + state.radius * Math.sin(state.phi) * Math.sin(state.theta)),
        meshPosition.z - (state.centerZ + state.radius * Math.cos(state.phi))
    );
    const pixelsToWorld = camDist * Math.tan(Math.PI / 8) * 2 / canvas.height;
    const hitThreshold = Math.max(pixelsToWorld * 12, gizmoRadius * 0.08); // 至少12像素宽
    
    for (const ring of rings) {
        const dist = rayRingDistance(ray.origin, ray.dir, center, ring.normal, gizmoRadius);
        if (dist < hitThreshold) return ring.name;
    }
    
    return null;
}

// 计算射线与线段的距离
function raySegmentDistance(rayOrigin, rayDir, segStart, segEnd) {
    const segDir = [segEnd[0]-segStart[0], segEnd[1]-segStart[1], segEnd[2]-segStart[2]];
    const segLen = Math.hypot(segDir[0], segDir[1], segDir[2]);
    segDir[0]/=segLen; segDir[1]/=segLen; segDir[2]/=segLen;
    
    const w = [rayOrigin[0]-segStart[0], rayOrigin[1]-segStart[1], rayOrigin[2]-segStart[2]];
    const a = rayDir[0]*rayDir[0]+rayDir[1]*rayDir[1]+rayDir[2]*rayDir[2];
    const b = rayDir[0]*segDir[0]+rayDir[1]*segDir[1]+rayDir[2]*segDir[2];
    const c = segDir[0]*segDir[0]+segDir[1]*segDir[1]+segDir[2]*segDir[2];
    const d = rayDir[0]*w[0]+rayDir[1]*w[1]+rayDir[2]*w[2];
    const e = segDir[0]*w[0]+segDir[1]*w[1]+segDir[2]*w[2];
    
    const denom = a*c - b*b;
    let sN, sD = denom;
    let tN, tD = denom;
    
    if (denom < 0.000001) {
        sN = 0; sD = 1; tN = e; tD = c;
    } else {
        sN = (b*e - c*d);
        tN = (a*e - b*d);
        if (sN < 0) { sN = 0; tN = e; tD = c; }
        else if (sN > sD) { sN = sD; tN = e + b; tD = c; }
    }
    
    if (tN < 0) tN = 0;
    else if (tN > tD * segLen) tN = segLen * tD;
    
    const t = (tD < 0.000001) ? 0 : tN / tD;
    
    const closestOnSeg = [segStart[0]+segDir[0]*t, segStart[1]+segDir[1]*t, segStart[2]+segDir[2]*t];
    const s = (sD < 0.000001) ? 0 : sN / sD;
    const closestOnRay = [rayOrigin[0]+rayDir[0]*s, rayOrigin[1]+rayDir[1]*s, rayOrigin[2]+rayDir[2]*s];
    
    return Math.hypot(closestOnRay[0]-closestOnSeg[0], closestOnRay[1]-closestOnSeg[1], closestOnRay[2]-closestOnSeg[2]);
}

// 计算射线与环的距离
function rayRingDistance(rayOrigin, rayDir, ringCenter, ringNormal, ringRadius) {
    // 简化：采样环上的点，找最近距离
    const minDist = Infinity;
    const samples = 32;
    
    // 找到环平面上的两个正交向量
    let u = [0, 0, 0], v = [0, 0, 0];
    if (Math.abs(ringNormal[0]) < 0.9) {
        u = [0, -ringNormal[2], ringNormal[1]];
    } else {
        u = [-ringNormal[2], 0, ringNormal[0]];
    }
    const uLen = Math.hypot(u[0], u[1], u[2]);
    u[0]/=uLen; u[1]/=uLen; u[2]/=uLen;
    
    v = [ringNormal[1]*u[2]-ringNormal[2]*u[1],
         ringNormal[2]*u[0]-ringNormal[0]*u[2],
         ringNormal[0]*u[1]-ringNormal[1]*u[0]];
    
    let closestDist = Infinity;
    for (let i = 0; i < samples; i++) {
        const angle = (i / samples) * Math.PI * 2;
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const px = ringCenter[0] + ringRadius * (u[0]*cos + v[0]*sin);
        const py = ringCenter[1] + ringRadius * (u[1]*cos + v[1]*sin);
        const pz = ringCenter[2] + ringRadius * (u[2]*cos + v[2]*sin);
        
        // 计算点到射线的距离
        const toPoint = [px-rayOrigin[0], py-rayOrigin[1], pz-rayOrigin[2]];
        const proj = toPoint[0]*rayDir[0]+toPoint[1]*rayDir[1]+toPoint[2]*rayDir[2];
        const closest = [rayOrigin[0]+rayDir[0]*proj, rayOrigin[1]+rayDir[1]*proj, rayOrigin[2]+rayDir[2]*proj];
        const dist = Math.hypot(px-closest[0], py-closest[1], pz-closest[2]);
        closestDist = Math.min(closestDist, dist);
    }
    
    return closestDist;
}

//==================== 11. 六视图按钮功能 ====================
const viewButtons = {
    front: document.getElementById('btnViewFront'),
    back: document.getElementById('btnViewBack'),
    left: document.getElementById('btnViewLeft'),
    right: document.getElementById('btnViewRight'),
    top: document.getElementById('btnViewTop'),
    bottom: document.getElementById('btnViewBottom')
};

// 六视图对应的球面坐标角度
const viewAngles = {
    front:  { theta: -Math.PI/2, phi: Math.PI/2 },  // 主视图：从-Y看向+Y
    back:   { theta: Math.PI/2,  phi: Math.PI/2 },  // 背视图：从+Y看向-Y
    left:   { theta: Math.PI,    phi: Math.PI/2 },  // 左视图：从-X看向+X
    right:  { theta: 0,          phi: Math.PI/2 },  // 右视图：从+X看向-X
    top:    { theta: 0,          phi: 0 },           // 俯视图：从+Z看向-Z
    bottom: { theta: 0,          phi: Math.PI }      // 仰视图：从-Z看向+Z
};

let currentView = 'front'; // 当前激活的视图
let animProgress = -1; // -1=空闲, 0~1=动画进度
let animDirection = 1; // 1=主视→背视, -1=背视→主视

// 更新按钮激活状态
function updateViewButtonActive(viewName) {
    Object.values(viewButtons).forEach(btn => btn.classList.remove('vb-active'));
    if(viewButtons[viewName]) viewButtons[viewName].classList.add('vb-active');
    currentView = viewName;
}

// 六视图按钮点击事件
Object.keys(viewButtons).forEach(viewName => {
    viewButtons[viewName].addEventListener('click', () => {
        const angles = viewAngles[viewName];
        
        if(viewName === 'top' || viewName === 'bottom') {
            // 俯视/仰视：保持当前theta，只改变phi（绕X轴旋转）
            state.targetPhi = angles.phi;
            animProgress = -1;
        } else if(viewName === 'back' && currentView === 'front') {
            // 主视→背视：沿X轴逆时针旋转180°（经过底部）
            animProgress = 0;
            animDirection = 1;
        } else if(viewName === 'front' && currentView === 'back') {
            // 背视→主视：反向旋转180°
            animProgress = 0;
            animDirection = -1;
        } else {
            // 其他视图：theta走最短路径
            let diff = angles.theta - state.targetTheta;
            while(diff > Math.PI) diff -= 2*Math.PI;
            while(diff < -Math.PI) diff += 2*Math.PI;
            state.targetTheta += diff;
            state.targetPhi = angles.phi;
            animProgress = -1;
        }
        
        updateViewButtonActive(viewName);
    });
});

// 边线着色器
const VS_EDGE = `
attribute vec3 aPos;
uniform mat4 uMVP;
void main(){
    gl_Position = uMVP * vec4(aPos, 1.0);
}`;
const FS_EDGE = `
precision mediump float;
uniform vec4 uColor;
void main(){
    gl_FragColor = uColor;
}`;

const edgeProgram = createProgram(gl, VS_EDGE, FS_EDGE);
const edgeU_MVP = gl.getUniformLocation(edgeProgram, 'uMVP');
const edgeU_Color = gl.getUniformLocation(edgeProgram, 'uColor');
const edgeAPos = gl.getAttribLocation(edgeProgram, 'aPos');

// 从三角网格提取边线并分类（可见/隐藏）- Z-buffer方案
function extractEdges(vertices, normals, scale, offsetX, offsetY, offsetZ) {
    const DIHEDRAL_THRESHOLD = 0.985; // cos(10°) - 降低阈值以捕获凹面边缘
    const GRID = 3200; // 深度缓冲区分辨率
    const SAMPLES = 1600; // 每条边采样点数
    
    // 收集所有三角面
    const triangles = [];
    let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
    
    for (let i = 0; i < vertices.length; i += 9) {
        const x0 = vertices[i]*scale+offsetX, y0 = vertices[i+1]*scale+offsetY, z0 = vertices[i+2]*scale+offsetZ;
        const x1 = vertices[i+3]*scale+offsetX, y1 = vertices[i+4]*scale+offsetY, z1 = vertices[i+5]*scale+offsetZ;
        const x2 = vertices[i+6]*scale+offsetX, y2 = vertices[i+7]*scale+offsetY, z2 = vertices[i+8]*scale+offsetZ;
        
        minX=Math.min(minX,x0,x1,x2); maxX=Math.max(maxX,x0,x1,x2);
        minY=Math.min(minY,y0,y1,y2); maxY=Math.max(maxY,y0,y1,y2);
        minZ=Math.min(minZ,z0,z1,z2); maxZ=Math.max(maxZ,z0,z1,z2);
        
        // 几何叉积法向量
        const e1x=x1-x0, e1y=y1-y0, e1z=z1-z0;
        const e2x=x2-x0, e2y=y2-y0, e2z=z2-z0;
        let fnx=e1y*e2z-e1z*e2y, fny=e1z*e2x-e1x*e2z, fnz=e1x*e2y-e1y*e2x;
        const fnLen=Math.hypot(fnx,fny,fnz);
        if(fnLen>0){fnx/=fnLen;fny/=fnLen;fnz/=fnLen;}
        
        triangles.push({
            v0:[x0,y0,z0], v1:[x1,y1,z1], v2:[x2,y2,z2],
            n:[fnx,fny,fnz]
        });
    }
    
    // 收集所有边
    const edgeMap = new Map();
    for(const tri of triangles){
        const edges=[[tri.v0,tri.v1],[tri.v1,tri.v2],[tri.v2,tri.v0]];
        for(const[a,b]of edges){
            const key=edgeKey(a,b);
            if(!edgeMap.has(key)) edgeMap.set(key,{a,b,normals:[]});
            edgeMap.get(key).normals.push(tri.n);
        }
    }
    
    // 包围盒中心
    const cx=(minX+maxX)/2, cy=(minY+maxY)/2, cz=(minZ+maxZ)/2;
    const modelSize = Math.max(maxX-minX, maxY-minY, maxZ-minZ);
    const depthTolerance = modelSize * 0.003; // 相对容差
    
    // 修正法向量方向：确保指向远离包围盒中心
    for(const[key,edge]of edgeMap){
        const midX=(edge.a[0]+edge.b[0])/2, midY=(edge.a[1]+edge.b[1])/2, midZ=(edge.a[2]+edge.b[2])/2;
        const toSurfaceX=midX-cx, toSurfaceY=midY-cy, toSurfaceZ=midZ-cz;
        for(const n of edge.normals){
            if(n[0]*toSurfaceX+n[1]*toSurfaceY+n[2]*toSurfaceZ<0){
                n[0]=-n[0];n[1]=-n[1];n[2]=-n[2];
            }
        }
    }
    
    // 为每个视图构建双深度缓冲区 + 计算凸包边界边集合
    // frontBuf: 只用朝前三角形 → 代表"不透视下可见的表面"
    // fullBuf: 用所有三角形 → 代表"完整表面覆盖，无间隙"
    const viewDirs=[[0,-1,0],[0,0,-1],[-1,0,0]];
    const frontDepthBuffers = [];
    const fullDepthBuffers = [];
    
    // 每视图的凸包边界边集合（存储 edgeKey）
    const hullEdgeSets = [];
    
    // 收集所有唯一顶点（去重）
    const uniqueVerts = [];
    const vertSet = new Set();
    for(const tri of triangles){
        for(const v of [tri.v0, tri.v1, tri.v2]){
            const vk=`${v[0].toFixed(4)},${v[1].toFixed(4)},${v[2].toFixed(4)}`;
            if(!vertSet.has(vk)){
                vertSet.add(vk);
                uniqueVerts.push(v);
            }
        }
    }
    
    // Andrew's monotone chain 凸包算法 (2D)
    function convexHull(points){
        // points: [[x,y], ...]
        const n=points.length;
        if(n<3) return points.map((_,i)=>i);
        
        // 按 x 排序，x 相同按 y 排序
        const idx=Array.from({length:n},(_,i)=>i);
        idx.sort((a,b)=>{
            if(points[a][0]!==points[b][0]) return points[a][0]-points[b][0];
            return points[a][1]-points[b][1];
        });
        
        // 叉积 (O,A,B)
        const cross=(O,A,B)=>(A[0]-O[0])*(B[1]-O[1])-(A[1]-O[1])*(B[0]-O[0]);
        
        // 下凸包
        const lower=[];
        for(const i of idx){
            while(lower.length>=2 && cross(points[lower[lower.length-2]],points[lower[lower.length-1]],points[i])<=0)
                lower.pop();
            lower.push(i);
        }
        // 上凸包
        const upper=[];
        for(const i of idx.slice().reverse()){
            while(upper.length>=2 && cross(points[upper[upper.length-2]],points[upper[upper.length-1]],points[i])<=0)
                upper.pop();
            upper.push(i);
        }
        // 合并（去掉重复的首尾点）
        lower.pop(); upper.pop();
        return lower.concat(upper);
    }
    
    for(let vi=0;vi<3;vi++){
        const vd=viewDirs[vi];
        const frontBuf = new Float64Array(GRID * GRID);
        const fullBuf = new Float64Array(GRID * GRID);
        for(let i=0;i<GRID*GRID;i++){
            frontBuf[i]=Infinity;
            fullBuf[i]=Infinity;
        }
        
        for(const tri of triangles){
            const dot = tri.n[0]*vd[0]+tri.n[1]*vd[1]+tri.n[2]*vd[2];
            // 所有三角形写入 fullBuf（完整覆盖）
            rasterizeTriangle(tri, vd, fullBuf, GRID, minX,maxX,minY,maxY,minZ,maxZ);
            // 朝前三角形额外写入 frontBuf（可见表面）
            if(dot>0){
                rasterizeTriangle(tri, vd, frontBuf, GRID, minX,maxX,minY,maxY,minZ,maxZ);
            }
        }
        frontDepthBuffers.push(frontBuf);
        fullDepthBuffers.push(fullBuf);
        
        // 计算该视图的凸包
        const proj2D = uniqueVerts.map(v=>{
            if(vi===0) return [v[0], v[2]];       // 主视图: XZ
            if(vi===1) return [v[0], v[1]];       // 俯视图: XY
            return [v[1], v[2]];                   // 左视图: YZ
        });
        const hullIndices = convexHull(proj2D);
        
        // 构建凸包顶点集合 + 相邻关系
        const hullVertSet = new Set(hullIndices);
        const hullAdjacency = new Map(); // hullIndex -> Set of adjacent hull indices
        const hLen = hullIndices.length;
        for(let i=0;i<hLen;i++){
            const a=hullIndices[i], b=hullIndices[(i+1)%hLen];
            if(!hullAdjacency.has(a)) hullAdjacency.set(a,new Set());
            if(!hullAdjacency.has(b)) hullAdjacency.set(b,new Set());
            hullAdjacency.get(a).add(b);
            hullAdjacency.get(b).add(a);
        }
        
        // 收集所有在凸包上的边
        const hullEdges = new Set();
        for(const[key,edge]of edgeMap){
            const{a,b}=edge;
            // 找到 a, b 在 uniqueVerts 中的索引
            let ai=-1, bi=-1;
            for(let i=0;i<uniqueVerts.length;i++){
                const v=uniqueVerts[i];
                if(ai<0 && Math.abs(v[0]-a[0])<1e-6 && Math.abs(v[1]-a[1])<1e-6 && Math.abs(v[2]-a[2])<1e-6) ai=i;
                if(bi<0 && Math.abs(v[0]-b[0])<1e-6 && Math.abs(v[1]-b[1])<1e-6 && Math.abs(v[2]-b[2])<1e-6) bi=i;
                if(ai>=0 && bi>=0) break;
            }
            if(ai>=0 && bi>=0 && hullVertSet.has(ai) && hullVertSet.has(bi)){
                // 检查 a, b 是否在凸包上相邻
                if(hullAdjacency.has(ai) && hullAdjacency.get(ai).has(bi)){
                    hullEdges.add(key);
                }
            }
        }
        hullEdgeSets.push(hullEdges);
    }
    
    const result={frontAll:[],frontVisible:[],frontHidden:[],topAll:[],topVisible:[],topHidden:[],leftAll:[],leftVisible:[],leftHidden:[]};
    const viewResults=[
        {vis:result.frontVisible,hid:result.frontHidden,all:result.frontAll},
        {vis:result.topVisible,hid:result.topHidden,all:result.topAll},
        {vis:result.leftVisible,hid:result.leftHidden,all:result.leftAll}
    ];
    
    // 对每条边进行分类
    for(const[key,edge]of edgeMap){
        const{a,b,normals:faceNormals}=edge;
        
        // 二面角过滤：只保留相邻面法向量夹角 > 23° 的特征边
        let isFeature=false;
        if(faceNormals.length===1) isFeature=true;
        else{
            for(let i=0;i<faceNormals.length&&!isFeature;i++){
                for(let j=i+1;j<faceNormals.length&&!isFeature;j++){
                    const d=Math.abs(faceNormals[i][0]*faceNormals[j][0]+faceNormals[i][1]*faceNormals[j][1]+faceNormals[i][2]*faceNormals[j][2]);
                    if(d<DIHEDRAL_THRESHOLD) isFeature=true;
                }
            }
        }
        
        // 每视图独立判断
        for(let vi=0;vi<3;vi++){
            const vd=viewDirs[vi];
            
            // 计算每个面的dot值
            const dots = faceNormals.map(n => n[0]*vd[0]+n[1]*vd[1]+n[2]*vd[2]);
            
            let hasFront=false,hasBack=false;
            for(const d of dots){
                if(d>0) hasFront=true;
                if(d<0) hasBack=true;
            }
            
            // 轮廓边检测（曲面外轮廓）：
            // 1. 严格轮廓：一侧朝前一侧朝后
            // 2. 任意面法向量接近垂直视线（|dot|很小）→ 该面位于轮廓边界
            let isSilhouette = hasFront && hasBack;
            
            if(!isSilhouette){
                for(const d of dots){
                    if(Math.abs(d)<0.1){
                        isSilhouette=true;
                        break;
                    }
                }
            }
            
            // 轮廓边直接通过，非轮廓边需要是特征边
            if(!isSilhouette && !isFeature) continue;
            
            // 所有边都加入 allEdges（第一层：全部画虚线）
            viewResults[vi].all.push(a[0],a[1],a[2],b[0],b[1],b[2]);
            
            // 前置过滤：所有面都朝后的边，在完全不透视下不可见，跳过实线判定
            if(!hasFront) continue;
            
            // 有朝前面的边，进行双深度缓冲区测试
            const frontBuf = frontDepthBuffers[vi];
            const fullBuf = fullDepthBuffers[vi];
            let visCount=0,hidCount=0;
            
            for(let s=0;s<=SAMPLES;s++){
                const t=s/SAMPLES;
                const px=a[0]+(b[0]-a[0])*t;
                const py=a[1]+(b[1]-a[1])*t;
                const pz=a[2]+(b[2]-a[2])*t;
                
                let u,v,depth;
                if(vi===0){ u=px; v=pz; depth=py; }
                else if(vi===1){ u=px; v=py; depth=pz; }
                else { u=py; v=pz; depth=px; }
                
                let gi,gj;
                if(vi===0){
                    gi=Math.floor((u-minX)/(maxX-minX)*(GRID-1));
                    gj=Math.floor((v-minZ)/(maxZ-minZ)*(GRID-1));
                } else if(vi===1){
                    gi=Math.floor((u-minX)/(maxX-minX)*(GRID-1));
                    gj=Math.floor((v-minY)/(maxY-minY)*(GRID-1));
                } else {
                    gi=Math.floor((u-minY)/(maxY-minY)*(GRID-1));
                    gj=Math.floor((v-minZ)/(maxZ-minZ)*(GRID-1));
                }
                
                if(gi>=0&&gi<GRID&&gj>=0&&gj<GRID){
                    const idx=gj*GRID+gi;
                    const fDepth=frontBuf[idx];
                    const bDepth=fullBuf[idx];
                    
                    // 优先检查 frontBuf（朝前三角形）
                    if(fDepth!==Infinity){
                        // 边深度 ≈ 朝前表面深度 → 在可见表面上
                        if(Math.abs(depth-fDepth)<=depthTolerance*2){
                            visCount++;
                        } else if(depth>fDepth+depthTolerance){
                            // 边深度 > 朝前表面 → 被遮挡
                            hidCount++;
                        } else {
                            // 边深度略小于朝前表面（可能在表面前方）→ 可见
                            visCount++;
                        }
                    } else if(bDepth!==Infinity){
                        // frontBuf 为 Infinity（间隙），回退检查 fullBuf
                        // 边深度 ≈ 完整表面深度 → 在表面上（可能是背面）
                        if(Math.abs(depth-bDepth)<=depthTolerance*2){
                            // 检查该位置是否有朝前面：如果 fullBuf 深度比边深度大很多，说明边在背面
                            if(depth<bDepth-depthTolerance*3){
                                // 边在背面（深度比表面小，但在背面方向）
                                hidCount++;
                            } else {
                                visCount++;
                            }
                        } else if(depth>bDepth+depthTolerance){
                            // 边在表面后方 → 被遮挡
                            hidCount++;
                        } else {
                            visCount++;
                        }
                    } else {
                        // 两个缓冲区都是 Infinity → 超出模型范围
                        visCount++;
                    }
                } else {
                    visCount++;
                }
            }
            
            // 不透视下可见 → 实线（第二层覆盖）
            // 硬性约束：凸包边界边强制为实线
            if(visCount>hidCount || hullEdgeSets[vi].has(key)) viewResults[vi].vis.push(a[0],a[1],a[2],b[0],b[1],b[2]);
        }
    }
    
    return result;
}

// 光栅化三角形到深度缓冲区
function rasterizeTriangle(tri, viewDir, depthBuf, GRID, minX,maxX,minY,maxY,minZ,maxZ){
    const {v0,v1,v2,n} = tri;
    
    // 投影到2D
    let p0u,p0v,d0, p1u,p1v,d1, p2u,p2v,d2;
    let rangeU, rangeV;
    
    if(viewDir[1]!==0){ // 主视图: 投影面XZ
        p0u=v0[0]; p0v=v0[2]; d0=v0[1];
        p1u=v1[0]; p1v=v1[2]; d1=v1[1];
        p2u=v2[0]; p2v=v2[2]; d2=v2[1];
        rangeU=maxX-minX; rangeV=maxZ-minZ;
    } else if(viewDir[2]!==0){ // 俯视图: 投影面XY
        p0u=v0[0]; p0v=v0[1]; d0=v0[2];
        p1u=v1[0]; p1v=v1[1]; d1=v1[2];
        p2u=v2[0]; p2v=v2[1]; d2=v2[2];
        rangeU=maxX-minX; rangeV=maxY-minY;
    } else { // 左视图: 投影面YZ
        p0u=v0[1]; p0v=v0[2]; d0=v0[0];
        p1u=v1[1]; p1v=v1[2]; d1=v1[0];
        p2u=v2[1]; p2v=v2[2]; d2=v2[0];
        rangeU=maxY-minY; rangeV=maxZ-minZ;
    }
    
    // 计算2D包围盒
    const minU=Math.min(p0u,p1u,p2u), maxU=Math.max(p0u,p1u,p2u);
    const minV=Math.min(p0v,p1v,p2v), maxV=Math.max(p0v,p1v,p2v);
    
    // 防止除零
    if(rangeU<1e-10||rangeV<1e-10) return;
    
    let giMin=Math.floor((minU-(viewDir[1]!==0?minX:viewDir[2]!==0?minX:minY))/rangeU*(GRID-1));
    let giMax=Math.ceil((maxU-(viewDir[1]!==0?minX:viewDir[2]!==0?minX:minY))/rangeU*(GRID-1));
    let gjMin=Math.floor((minV-(viewDir[1]!==0?minZ:viewDir[2]!==0?minY:minZ))/rangeV*(GRID-1));
    let gjMax=Math.ceil((maxV-(viewDir[1]!==0?minZ:viewDir[2]!==0?minY:minZ))/rangeV*(GRID-1));
    
    giMin=Math.max(0,giMin); giMax=Math.min(GRID-1,giMax);
    gjMin=Math.max(0,gjMin); gjMax=Math.min(GRID-1,gjMax);
    
    // 重心坐标光栅化
    const denom=(p1v-p2v)*(p0u-p2u)+(p2u-p1u)*(p0v-p2v);
    if(Math.abs(denom)<1e-10) return;
    
    for(let gj=gjMin;gj<=gjMax;gj++){
        for(let gi=giMin;gi<=giMax;gi++){
            // 网格中心的世界坐标
            const wu=(viewDir[1]!==0?minX:viewDir[2]!==0?minX:minY)+(gi+0.5)/(GRID-1)*rangeU;
            const wv=(viewDir[1]!==0?minZ:viewDir[2]!==0?minY:minZ)+(gj+0.5)/(GRID-1)*rangeV;
            
            const w1=((p1v-p2v)*(wu-p2u)+(p2u-p1u)*(wv-p2v))/denom;
            const w2=((p2v-p0v)*(wu-p2u)+(p0u-p2u)*(wv-p2v))/denom;
            const w0=1-w1-w2;
            
            if(w0>=0&&w1>=0&&w2>=0){
                const depth=w0*d0+w1*d1+w2*d2;
                const idx=gj*GRID+gi;
                if(depth<depthBuf[idx]) depthBuf[idx]=depth;
            }
        }
    }
}

function edgeKey(a,b){
    const ka=`${a[0].toFixed(4)},${a[1].toFixed(4)},${a[2].toFixed(4)}`;
    const kb=`${b[0].toFixed(4)},${b[1].toFixed(4)},${b[2].toFixed(4)}`;
    return ka<kb?`${ka}|${kb}`:`${kb}|${ka}`;
}

// 每视图独立可见性判断
function classifyEdgePerView(a,b,faceNormals,viewDir,visibleArr,hiddenArr){
    let frontCount=0,backCount=0;
    for(const n of faceNormals){
        const dot=n[0]*viewDir[0]+n[1]*viewDir[1]+n[2]*viewDir[2];
        if(dot>0.01) frontCount++;
        else if(dot<-0.01) backCount++;
    }
    if(frontCount>=backCount) visibleArr.push(a[0],a[1],a[2],b[0],b[1],b[2]);
    else hiddenArr.push(a[0],a[1],a[2],b[0],b[1],b[2]);
}

function createEdgeBuffer(data) {
    if (!data || data.length === 0) return null;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    return { buffer, count: data.length / 3 };
}

function buildEdgeData() {
    if (!meshData || !meshData.rawVertices || !meshData.rawNormals) return;
    
    const edges = extractEdges(
        meshData.rawVertices,
        meshData.rawNormals,
        meshData.scale,
        meshData.offsetX * meshData.scale,
        meshData.offsetY * meshData.scale,
        meshData.offsetZ * meshData.scale
    );
    
    if (edgeData.frontVisible) gl.deleteBuffer(edgeData.frontVisible.buffer);
    if (edgeData.frontHidden) gl.deleteBuffer(edgeData.frontHidden.buffer);
    if (edgeData.frontAll) gl.deleteBuffer(edgeData.frontAll.buffer);
    if (edgeData.topVisible) gl.deleteBuffer(edgeData.topVisible.buffer);
    if (edgeData.topHidden) gl.deleteBuffer(edgeData.topHidden.buffer);
    if (edgeData.topAll) gl.deleteBuffer(edgeData.topAll.buffer);
    if (edgeData.leftVisible) gl.deleteBuffer(edgeData.leftVisible.buffer);
    if (edgeData.leftHidden) gl.deleteBuffer(edgeData.leftHidden.buffer);
    if (edgeData.leftAll) gl.deleteBuffer(edgeData.leftAll.buffer);
    
    edgeData = {
        frontAll: createEdgeBuffer(edges.frontAll),
        frontVisible: createEdgeBuffer(edges.frontVisible),
        frontHidden: createEdgeBuffer(edges.frontHidden),
        topAll: createEdgeBuffer(edges.topAll),
        topVisible: createEdgeBuffer(edges.topVisible),
        topHidden: createEdgeBuffer(edges.topHidden),
        leftAll: createEdgeBuffer(edges.leftAll),
        leftVisible: createEdgeBuffer(edges.leftVisible),
        leftHidden: createEdgeBuffer(edges.leftHidden)
    };
}

function renderView(allEdges, visibleEdges, viewDir, upDir, viewport) {
    const [vx, vy, vw, vh] = viewport;
    gl.viewport(vx, vy, vw, vh);
    gl.scissor(vx, vy, vw, vh);
    
    const size = 10;
    const aspect = vw / vh;
    const left = -size * aspect;
    const right = size * aspect;
    const bottom = -size;
    const top = size;
    
    const projMat = Mat4.create();
    Mat4.ortho(projMat, left, right, bottom, top, 0.1, 100);
    
    const viewMat = Mat4.create();
    const eye = [viewDir[0] * 50, viewDir[1] * 50, viewDir[2] * 50];
    Mat4.lookAt(viewMat, eye, [0, 0, 0], upDir);
    
    const mvp = Mat4.create();
    Mat4.multiply(mvp, projMat, viewMat);
    
    gl.useProgram(edgeProgram);
    gl.uniformMatrix4fv(edgeU_MVP, false, mvp);
    
    // 禁用深度测试，确保两层都能绘制
    gl.disable(gl.DEPTH_TEST);
    
    // 第一层：所有边画为虚线（灰色细线）
    if (allEdges && allEdges.buffer) {
        gl.lineWidth(1.0);
        gl.uniform4f(edgeU_Color, 0.4, 0.4, 0.4, 0.5);
        gl.bindBuffer(gl.ARRAY_BUFFER, allEdges.buffer);
        gl.enableVertexAttribArray(edgeAPos);
        gl.vertexAttribPointer(edgeAPos, 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINES, 0, allEdges.count);
    }
    
    // 第二层：可见边画为实线（白色粗线）覆盖上去
    if (visibleEdges && visibleEdges.buffer) {
        gl.lineWidth(2.0);
        gl.uniform4f(edgeU_Color, 1.0, 1.0, 1.0, 1.0);
        gl.bindBuffer(gl.ARRAY_BUFFER, visibleEdges.buffer);
        gl.enableVertexAttribArray(edgeAPos);
        gl.vertexAttribPointer(edgeAPos, 3, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.LINES, 0, visibleEdges.count);
    }
    
    // 恢复深度测试
    gl.enable(gl.DEPTH_TEST);
}

function renderThreeViews() {
    if (!showThreeViews || !meshData) return;
    
    gl.enable(gl.SCISSOR_TEST);
    const w = canvas.width;
    const h = canvas.height;
    
    renderView(edgeData.frontAll, edgeData.frontVisible, [0, -1, 0], [0, 0, 1], [w * 0.24, h * 0.55, w * 0.25, h * 0.35]);
    renderView(edgeData.topAll, edgeData.topVisible, [0, 0, 1], [0, 1, 0], [w * 0.24, h * 0.18, w * 0.25, h * 0.35]);
    renderView(edgeData.leftAll, edgeData.leftVisible, [-1, 0, 0], [0, 0, 1], [w * 0.51, h * 0.55, w * 0.25, h * 0.35]);
    
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, 0, w, h);
}

// 渲染变换手柄（实心圆环面 + 实心箭头）
function renderGizmo() {
    if (!meshData) return;
    
    const s = meshData.scale;
    
    // 应用零件的旋转
    const rx = meshRotation.x, ry = meshRotation.y, rz = meshRotation.z;
    const crx = Math.cos(rx), srx = Math.sin(rx);
    const cry = Math.cos(ry), sry = Math.sin(ry);
    const crz = Math.cos(rz), srz = Math.sin(rz);
    
    // 旋转矩阵 R = Rz * Ry * Rx
    const r00 = cry*crz, r01 = srx*sry*crz-crx*srz, r02 = crx*sry*crz+srx*srz;
    const r10 = cry*srz, r11 = srx*sry*srz+crx*crz, r12 = crx*sry*srz-srx*crz;
    const r20 = -sry,    r21 = srx*cry,           r22 = crx*cry;
    
    // 零件几何中心
    const cx = meshPosition.x;
    const cy = meshPosition.y;
    const cz = meshPosition.z;
    
    // 基于零件几何中心到最远点距离计算手柄大小（自适应零件尺寸）
    // 方向环半径 = 零件几何中心到最远点距离 × 1.4
    const partRadius = meshData.maxDist;
    const gizmoRadius = partRadius * 1.4;
    const ringThickness = gizmoRadius * 0.06;  // 宽度减半
    
    // 2D箭头尺寸（billboard风格，始终面向相机）
    // 箭头长度 = 零件几何中心到最远点距离 × 2
    const arrowLength = partRadius * 2.0;
    const arrowWidth = gizmoRadius * 0.025;  // 宽度减半
    const arrowHeadLength = arrowWidth * 4;  // 箭头头部长度
    const arrowHeadWidth = arrowWidth * 2.5;  // 箭头头部宽度
    
    // 计算视图方向（用于billboard箭头）
    const sp = Math.sin(state.phi);
    const cp = Math.cos(state.phi);
    const eyeX = state.centerX + state.radius * sp * Math.cos(state.theta);
    const eyeY = state.centerY + state.radius * sp * Math.sin(state.theta);
    const eyeZ = state.centerZ + state.radius * cp;
    const viewDirX = cx - eyeX, viewDirY = cy - eyeY, viewDirZ = cz - eyeZ;
    const viewLen = Math.hypot(viewDirX, viewDirY, viewDirZ);
    const normViewX = viewDirX/viewLen, normViewY = viewDirY/viewLen, normViewZ = viewDirZ/viewLen;
    
    // 使用统一 Gizmo 着色器
    gl.useProgram(gizmoProgram);
    gl.uniform3f(gizmoU_LightDir, 0.5, 0.5, 1.0);
    gl.uniformMatrix4fv(gizmoU_MVP, false, mvpMat);
    
    // 启用混合实现半透明，禁用深度测试（圆环始终显示在零件上方）
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    
    // 辅助函数：生成实心圆环面顶点
    function generateAnnulus(normalX, normalY, normalZ, colorR, colorG, colorB, isHovered) {
        let u = [0, 0, 0], v = [0, 0, 0];
        if (Math.abs(normalX) < 0.9) {
            u = [0, -normalZ, normalY];
        } else {
            u = [-normalZ, 0, normalX];
        }
        const uLen = Math.hypot(u[0], u[1], u[2]);
        u[0]/=uLen; u[1]/=uLen; u[2]/=uLen;
        v = [normalY*u[2]-normalZ*u[1],
             normalZ*u[0]-normalX*u[2],
             normalX*u[1]-normalY*u[0]];
        
        const outerR = gizmoRadius + ringThickness;
        const innerR = gizmoRadius - ringThickness;
        
        const hr = Math.min(1, colorR + 0.4);
        const hg = Math.min(1, colorG + 0.4);
        const hb = Math.min(1, colorB + 0.4);
        const cr = isHovered ? hr : colorR;
        const cg = isHovered ? hg : colorG;
        const cb = isHovered ? hb : colorB;
        
        const segments = 64;
        const verts = [];
        for (let i = 0; i <= segments; i++) {
            const a = (i / segments) * Math.PI * 2;
            const cos = Math.cos(a), sin = Math.sin(a);
            const ox = cx + (u[0]*cos + v[0]*sin) * outerR;
            const oy = cy + (u[1]*cos + v[1]*sin) * outerR;
            const oz = cz + (u[2]*cos + v[2]*sin) * outerR;
            const ix = cx + (u[0]*cos + v[0]*sin) * innerR;
            const iy = cy + (u[1]*cos + v[1]*sin) * innerR;
            const iz = cz + (u[2]*cos + v[2]*sin) * innerR;
            verts.push(ox, oy, oz, normalX, normalY, normalZ, cr, cg, cb, 1);
            verts.push(ix, iy, iz, normalX, normalY, normalZ, cr, cg, cb, 1);
        }
        return verts;
    }
    
    // 辅助函数：生成billboard 2D箭头（始终面向相机）
    function generateArrow(dirX, dirY, dirZ, colorR, colorG, colorB, isHovered) {
        // 计算垂直于箭头方向和视图方向的向量（作为箭头的"宽度"方向）
        let wX = dirY * normViewZ - dirZ * normViewY;
        let wY = dirZ * normViewX - dirX * normViewZ;
        let wZ = dirX * normViewY - dirY * normViewX;
        const wLen = Math.hypot(wX, wY, wZ);
        if (wLen < 0.001) {
            // 箭头方向与视图方向几乎平行，使用备用向量
            wX = dirY * 0 - dirZ * 1;
            wY = dirZ * 1 - dirX * 0;
            wZ = dirX * 0 - dirY * 1;
            const wl = Math.hypot(wX, wY, wZ);
            wX /= wl; wY /= wl; wZ /= wl;
        } else {
            wX /= wLen; wY /= wLen; wZ /= wLen;
        }
        
        const hr = Math.min(1, colorR + 0.4);
        const hg = Math.min(1, colorG + 0.4);
        const hb = Math.min(1, colorB + 0.4);
        const cr = isHovered ? hr : colorR;
        const cg = isHovered ? hg : colorG;
        const cb = isHovered ? hb : colorB;
        
        const shaftLen = arrowLength - arrowHeadLength;
        const verts = [];
        
        // 法向量 = 视图方向（面向相机）
        const nx = normViewX, ny = normViewY, nz = normViewZ;
        
        // 箭头杆：细长四边形（2个三角形）
        const baseL = [cx - wX*arrowWidth, cy - wY*arrowWidth, cz - wZ*arrowWidth];
        const baseR = [cx + wX*arrowWidth, cy + wY*arrowWidth, cz + wZ*arrowWidth];
        const shaftEndL = [cx + dirX*shaftLen - wX*arrowWidth, cy + dirY*shaftLen - wY*arrowWidth, cz + dirZ*shaftLen - wZ*arrowWidth];
        const shaftEndR = [cx + dirX*shaftLen + wX*arrowWidth, cy + dirY*shaftLen + wY*arrowWidth, cz + dirZ*shaftLen + wZ*arrowWidth];
        
        // 三角形1: baseL, baseR, shaftEndR
        verts.push(baseL[0], baseL[1], baseL[2], nx, ny, nz, cr, cg, cb, 1);
        verts.push(baseR[0], baseR[1], baseR[2], nx, ny, nz, cr, cg, cb, 1);
        verts.push(shaftEndR[0], shaftEndR[1], shaftEndR[2], nx, ny, nz, cr, cg, cb, 1);
        // 三角形2: baseL, shaftEndR, shaftEndL
        verts.push(baseL[0], baseL[1], baseL[2], nx, ny, nz, cr, cg, cb, 1);
        verts.push(shaftEndR[0], shaftEndR[1], shaftEndR[2], nx, ny, nz, cr, cg, cb, 1);
        verts.push(shaftEndL[0], shaftEndL[1], shaftEndL[2], nx, ny, nz, cr, cg, cb, 1);
        
        // 箭头头部：三角形
        const tipX = cx + dirX * arrowLength;
        const tipY = cy + dirY * arrowLength;
        const tipZ = cz + dirZ * arrowLength;
        const headBaseL = [cx + dirX*shaftLen - wX*arrowHeadWidth, cy + dirY*shaftLen - wY*arrowHeadWidth, cz + dirZ*shaftLen - wZ*arrowHeadWidth];
        const headBaseR = [cx + dirX*shaftLen + wX*arrowHeadWidth, cy + dirY*shaftLen + wY*arrowHeadWidth, cz + dirZ*shaftLen + wZ*arrowHeadWidth];
        
        verts.push(headBaseL[0], headBaseL[1], headBaseL[2], nx, ny, nz, cr, cg, cb, 1);
        verts.push(headBaseR[0], headBaseR[1], headBaseR[2], nx, ny, nz, cr, cg, cb, 1);
        verts.push(tipX, tipY, tipZ, nx, ny, nz, cr, cg, cb, 1);
        
        return verts;
    }
    
    // 辅助函数：绘制顶点数组
    function drawVerts(verts) {
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
        gl.enableVertexAttribArray(gizmoAPos);
        gl.vertexAttribPointer(gizmoAPos, 3, gl.FLOAT, false, 40, 0);
        gl.enableVertexAttribArray(gizmoANormal);
        gl.vertexAttribPointer(gizmoANormal, 3, gl.FLOAT, false, 40, 12);
        gl.enableVertexAttribArray(gizmoAColor);
        gl.vertexAttribPointer(gizmoAColor, 4, gl.FLOAT, false, 40, 24);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, verts.length / 10);
        gl.deleteBuffer(buf);
    }
    
    // 绘制每个圆环（单独 draw call）
    drawVerts(generateAnnulus(r00, r10, r20, 1, 0.27, 0.27, hoveredRing === 'ringX'));
    drawVerts(generateAnnulus(r01, r11, r21, 0.27, 1, 0.27, hoveredRing === 'ringY'));
    drawVerts(generateAnnulus(r02, r12, r22, 0.27, 0.53, 1, hoveredRing === 'ringZ'));
    
    // 绘制每个箭头（单独 draw call）
    drawVerts(generateArrow(r00, r10, r20, 1, 0.27, 0.27, hoveredArrow === 'arrowX'));
    drawVerts(generateArrow(r01, r11, r21, 0.27, 1, 0.27, hoveredArrow === 'arrowY'));
    drawVerts(generateArrow(r02, r12, r22, 0.27, 0.53, 1, hoveredArrow === 'arrowZ'));
    
    // 恢复深度测试和深度写入，禁用混合
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    
    // 禁用 gizmo attribute
    gl.disableVertexAttribArray(gizmoAPos);
    gl.disableVertexAttribArray(gizmoANormal);
    gl.disableVertexAttribArray(gizmoAColor);
}

function animate() {
    requestAnimationFrame(animate);

    // 主视背视 180°旋转动画（经过底部）
    if(animProgress >= 0 && animProgress < 1) {
        animProgress += 0.012; // 动画速度
        if(animProgress > 1) animProgress = 1;
        
        const t = animProgress;
        // 前半段(0~0.5)：phi从π/2→π（向下）
        // 后半段(0.5~1)：phi从π→π/2（向上），theta从起始→目标
        if(t <= 0.5) {
            const s = t * 2; // 0~1
            state.targetPhi = Math.PI/2 + (Math.PI - Math.PI/2) * s;
            state.targetTheta = -Math.PI/2 * animDirection; // 保持起始theta
        } else {
            const s = (t - 0.5) * 2; // 0~1
            state.targetPhi = Math.PI - (Math.PI - Math.PI/2) * s;
            state.targetTheta = (-Math.PI/2 + Math.PI * s) * animDirection;
        }
    }

    //阻尼插值
    state.theta += (state.targetTheta - state.theta) * state.damping;
    state.phi += (state.targetPhi - state.phi) * state.damping;
    state.radius += (state.targetRadius - state.radius) * state.damping;
    state.centerX += (state.targetCenterX - state.centerX) * state.damping;
    state.centerY += (state.targetCenterY - state.centerY) * state.damping;
    state.centerZ += (state.targetCenterZ - state.centerZ) * state.damping;

    //球面坐标 -> 相机位置 (Z轴向上)
    const sp = Math.sin(state.phi);
    const cp = Math.cos(state.phi);
    const eye = [
        state.centerX + state.radius * sp * Math.cos(state.theta),
        state.centerY + state.radius * sp * Math.sin(state.theta),
        state.centerZ + state.radius * cp
    ];
    // 俯视/仰视时切换up向量，避免与视线平行
    let upDir = [0, 0, 1];
    if (currentView === 'top') upDir = [0, 1, 0];      // 俯视：X右，Y上
    else if (currentView === 'bottom') upDir = [0, -1, 0]; // 仰视：X右，Y下
    Mat4.lookAt(viewMat, eye, [state.centerX, state.centerY, state.centerZ], upDir);
    
    //MVP = Proj * View
    const tmp = Mat4.create();
    for(let i=0;i<4;i++) for(let j=0;j<4;j++){
        tmp[j*4+i] = 0;
        for(let k=0;k<4;k++) tmp[j*4+i] += projMat[k*4+i] * viewMat[j*4+k];
    }
    mvpMat.set(tmp);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);

    //渲染线条（坐标轴+网格）
    gl.useProgram(lineProgram);
    gl.uniformMatrix4fv(lineU_MVP, false, mvpMat);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(lineAPos);
    gl.vertexAttribPointer(lineAPos, 3, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(lineAColor);
    gl.vertexAttribPointer(lineAColor, 4, gl.FLOAT, false, STRIDE, 12);
    
    if (whiteBackground) {
        // 坐标轴不淡化
        gl.uniform1f(lineU_GridAlpha, 1.0);
        gl.drawArrays(gl.LINES, 0, gridStartIdx / 7);
        // 网格线淡化
        gl.uniform1f(lineU_GridAlpha, 0.15);
        gl.drawArrays(gl.LINES, gridStartIdx / 7, totalVerts - gridStartIdx / 7);
    } else {
        gl.uniform1f(lineU_GridAlpha, 1.0);
        gl.drawArrays(gl.LINES, 0, totalVerts);
    }

    //渲染网格模型
    if (meshData && meshData.vbo) {
        gl.useProgram(meshProgram);
        
        //计算模型矩阵（缩放+旋转+平移）
        // 关键：旋转围绕几何中心，而非局部原点
        // 几何中心在局部空间为 (-offsetX, -offsetY, -offsetZ)
        // M = T(meshPosition) * R * S * T(offset)  —— 先平移到几何中心为原点，旋转，再移回
        const s = meshData.scale;
        
        // 旋转矩阵 R = Rz * Ry * Rx
        const cx = Math.cos(meshRotation.x), sx = Math.sin(meshRotation.x);
        const cy = Math.cos(meshRotation.y), sy = Math.sin(meshRotation.y);
        const cz = Math.cos(meshRotation.z), sz = Math.sin(meshRotation.z);
        
        const r00 = cy*cz, r01 = sx*sy*cz-cx*sz, r02 = cx*sy*cz+sx*sz;
        const r10 = cy*sz, r11 = sx*sy*sz+cx*cz, r12 = cx*sy*sz-sx*cz;
        const r20 = -sy,   r21 = sx*cy,          r22 = cx*cy;
        
        // 几何中心在局部空间: centerLocal = (-offsetX, -offsetY, -offsetZ)
        // 变换: M*p = R*S*(p - centerLocal) + meshPosition
        //       = R*S*p - R*S*centerLocal + meshPosition
        // 所以平移 = meshPosition - R*S*centerLocal = meshPosition + R*S*offset
        const ox = meshData.offsetX * s;
        const oy = meshData.offsetY * s;
        const oz = meshData.offsetZ * s;
        
        const m = Mat4.create();
        m[0] = r00*s; m[1] = r10*s; m[2] = r20*s; m[3] = 0;
        m[4] = r01*s; m[5] = r11*s; m[6] = r21*s; m[7] = 0;
        m[8] = r02*s; m[9] = r12*s; m[10]= r22*s; m[11]= 0;
        m[12]= r00*ox + r01*oy + r02*oz + meshPosition.x;
        m[13]= r10*ox + r11*oy + r12*oz + meshPosition.y;
        m[14]= r20*ox + r21*oy + r22*oz + meshPosition.z;
        m[15]= 1;
        modelMat.set(m);
        
        //MVP * Model
        const meshMVP = Mat4.create();
        Mat4.multiply(meshMVP, mvpMat, modelMat);
        
        // 高亮效果：悬停时提高亮度
        const highlightBoost = isHovering ? 0.15 : 0;
        const cr = Math.min(1, meshColor.r + highlightBoost);
        const cg = Math.min(1, meshColor.g + highlightBoost);
        const cb = Math.min(1, meshColor.b + highlightBoost);
        
        // === 使用模板缓冲实现轮廓边 ===
        
        // 1. 渲染零件，同时在模板缓冲中标记零件区域为1
        gl.enable(gl.STENCIL_TEST);
        gl.stencilFunc(gl.ALWAYS, 1, 0xFF);
        gl.stencilMask(0xFF);
        
        gl.useProgram(meshProgram);
        gl.uniformMatrix4fv(meshU_MVP, false, meshMVP);
        gl.uniformMatrix4fv(meshU_Model, false, modelMat);
        gl.uniform3f(meshU_Color, cr, cg, cb);
        gl.uniform1f(meshU_Ambient, whiteBackground ? 0.6 : 0.3);
        
        // 设置剖切平面
        if (sectionMode) {
            gl.uniform1i(meshU_ClipEnabled, 1);
            // 剖切平面方程: normal·(p - pos) = 0 => normal·p - normal·pos = 0
            // 裁剪条件: normal·p - normal·pos > 0 时 discard
            // 所以 clipPlane = (normal, -normal·pos)
            const d = -(sectionPlaneNormal[0]*sectionPlanePos[0] + 
                       sectionPlaneNormal[1]*sectionPlanePos[1] + 
                       sectionPlaneNormal[2]*sectionPlanePos[2]);
            gl.uniform4f(meshU_ClipPlane, sectionPlaneNormal[0], sectionPlaneNormal[1], sectionPlaneNormal[2], d);
        } else {
            gl.uniform1i(meshU_ClipEnabled, 0);
        }
        
        gl.bindBuffer(gl.ARRAY_BUFFER, meshData.vbo);
        gl.enableVertexAttribArray(meshAPos);
        gl.vertexAttribPointer(meshAPos, 3, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(meshANormal);
        gl.vertexAttribPointer(meshANormal, 3, gl.FLOAT, false, 24, 12);
        
        gl.drawArrays(gl.TRIANGLES, 0, meshData.vertexCount);
        
        // 2. 渲染轮廓边：只渲染背面（反转外壳），只在模板值为0（零件外部）的像素显示
        if(showOutline) {
            gl.stencilFunc(gl.EQUAL, 0, 0xFF);
            gl.stencilMask(0x00);
            
            gl.useProgram(outlineProgram);
            gl.uniformMatrix4fv(outlineU_MVP, false, meshMVP);
            gl.uniform1f(outlineU_Width, 0.75); // 轮廓线宽度0.75mm
            
            gl.bindBuffer(gl.ARRAY_BUFFER, meshData.vbo);
            gl.enableVertexAttribArray(outlineAPos);
            gl.vertexAttribPointer(outlineAPos, 3, gl.FLOAT, false, 24, 0);
            gl.enableVertexAttribArray(outlineANormal);
            gl.vertexAttribPointer(outlineANormal, 3, gl.FLOAT, false, 24, 12);
            
            // 只渲染背面（反转外壳技术的核心）
            gl.enable(gl.CULL_FACE);
            gl.cullFace(gl.FRONT);
            gl.drawArrays(gl.TRIANGLES, 0, meshData.vertexCount);
            gl.disable(gl.CULL_FACE);
        }
        
        // 重置模板状态
        gl.disable(gl.STENCIL_TEST);
        gl.stencilMask(0xFF);
        
        // 渲染特征边缘（锐利边缘+凹角边缘）
        if(showOutline && meshData.featureEdgeVbo && meshData.featureEdgeCount > 0) {
            gl.useProgram(lineProgram);
            gl.uniformMatrix4fv(lineU_MVP, false, meshMVP);
            gl.uniform1f(lineU_GridAlpha, 1.0); // 特征边缘不受网格淡化影响
            
            gl.bindBuffer(gl.ARRAY_BUFFER, meshData.featureEdgeVbo);
            gl.enableVertexAttribArray(lineAPos);
            gl.vertexAttribPointer(lineAPos, 3, gl.FLOAT, false, 12, 0);
            gl.disableVertexAttribArray(lineAColor);
            gl.vertexAttrib4f(lineAColor, 0, 0, 0, 1);  // 黑色
            
            gl.lineWidth(2.0);
            gl.drawArrays(gl.LINES, 0, meshData.featureEdgeCount * 2);
        }
    }
    
    // 渲染变换手柄（选中时，在零件之后渲染）
    if (isSelected && meshData) {
        renderGizmo();
    }
    
    // 渲染剖切平面
    if (sectionMode && meshData) {
        renderSectionPlane();
    }
    
    // 渲染三视图
    renderThreeViews();
}

// 剖切平面预分配 VBO
const sectionPlaneVerts = new Float32Array(42);  // 6个顶点 × 7 floats
const sectionPlaneVbo = gl.createBuffer();

// 渲染剖切平面（仅矩形，无箭头）
function renderSectionPlane() {
    const size = sectionPlaneSize;
    if (size < 0.001) return;
    
    const pos = sectionPlanePos;
    const normal = sectionPlaneNormal;
    
    // 计算切向量
    let t1x, t1y, t1z, t2x, t2y, t2z;
    if (Math.abs(normal[2]) > 0.9) {
        t1x = 1; t1y = 0; t1z = 0;
    } else {
        t1x = normal[1]; t1y = -normal[0]; t1z = 0;
        const l1 = Math.hypot(t1x, t1y, t1z);
        t1x /= l1; t1y /= l1; t1z /= l1;
    }
    t2x = normal[1]*t1z - normal[2]*t1y;
    t2y = normal[2]*t1x - normal[0]*t1z;
    t2z = normal[0]*t1y - normal[1]*t1x;
    const l2 = Math.hypot(t2x, t2y, t2z);
    t2x /= l2; t2y /= l2; t2z /= l2;
    
    const h = size / 2;
    const ax = pos[0] - t1x*h - t2x*h, ay = pos[1] - t1y*h - t2y*h, az = pos[2] - t1z*h - t2z*h;
    const bx = pos[0] + t1x*h - t2x*h, by = pos[1] + t1y*h - t2y*h, bz = pos[2] + t1z*h - t2z*h;
    const cx = pos[0] + t1x*h + t2x*h, cy = pos[1] + t1y*h + t2y*h, cz = pos[2] + t1z*h + t2z*h;
    const dx = pos[0] - t1x*h + t2x*h, dy = pos[1] - t1y*h + t2y*h, dz = pos[2] - t1z*h + t2z*h;
    
    // 悬停高亮颜色 vs 普通颜色
    const cr = sectionPlaneHovered ? 0.5 : 0.3;
    const cg = sectionPlaneHovered ? 0.85 : 0.7;
    const cb = sectionPlaneHovered ? 1.0 : 1.0;
    const ca = sectionPlaneHovered ? 0.6 : 0.4;
    
    // 矩形顶点数据
    const v = sectionPlaneVerts;
    let i = 0;
    v[i++]=ax; v[i++]=ay; v[i++]=az; v[i++]=cr; v[i++]=cg; v[i++]=cb; v[i++]=ca;
    v[i++]=bx; v[i++]=by; v[i++]=bz; v[i++]=cr; v[i++]=cg; v[i++]=cb; v[i++]=ca;
    v[i++]=cx; v[i++]=cy; v[i++]=cz; v[i++]=cr; v[i++]=cg; v[i++]=cb; v[i++]=ca;
    v[i++]=ax; v[i++]=ay; v[i++]=az; v[i++]=cr; v[i++]=cg; v[i++]=cb; v[i++]=ca;
    v[i++]=cx; v[i++]=cy; v[i++]=cz; v[i++]=cr; v[i++]=cg; v[i++]=cb; v[i++]=ca;
    v[i++]=dx; v[i++]=dy; v[i++]=dz; v[i++]=cr; v[i++]=cg; v[i++]=cb; v[i++]=ca;
    
    // 禁用深度测试等
    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.STENCIL_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    
    // 渲染矩形
    gl.useProgram(sectionProgram);
    gl.uniformMatrix4fv(sectionU_MVP, false, mvpMat);
    gl.bindBuffer(gl.ARRAY_BUFFER, sectionPlaneVbo);
    gl.bufferData(gl.ARRAY_BUFFER, sectionPlaneVerts, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(sectionAPos);
    gl.vertexAttribPointer(sectionAPos, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(sectionAColor);
    gl.vertexAttribPointer(sectionAColor, 4, gl.FLOAT, false, 28, 12);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disableVertexAttribArray(sectionAPos);
    gl.disableVertexAttribArray(sectionAColor);
    
    // 恢复状态
    gl.disable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
}

//6. STL 文件解析
let meshData = null;

// 边线数据缓存（提前声明，供 btnClear 使用）
let edgeData = {
    frontVisible: null,
    frontHidden: null,
    topVisible: null,
    topHidden: null,
    leftVisible: null,
    leftHidden: null
};

function parseSTL(text) {
    const vertices = [];
    const normals = [];
    
    //ASCII STL 解析
    const lines = text.split('\n');
    let currentNormal = [0, 0, 0];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (line.startsWith('facet normal')) {
            const parts = line.split(/\s+/);
            currentNormal = [
                parseFloat(parts[2]),
                parseFloat(parts[3]),
                parseFloat(parts[4])
            ];
        } else if (line.startsWith('vertex')) {
            const parts = line.split(/\s+/);
            vertices.push(
                parseFloat(parts[1]),
                parseFloat(parts[2]),
                parseFloat(parts[3])
            );
            normals.push(currentNormal[0], currentNormal[1], currentNormal[2]);
        }
    }
    
    if (vertices.length === 0) {
        return { vertexCount: 0 };
    }
    
    const result = createMeshData(vertices, normals);
    result.rawVertices = vertices;
    result.rawNormals = normals;
    return result;
}

function parseBinarySTL(buffer) {
    const view = new DataView(buffer);
    const vertexCount = view.getUint32(80, true);
    
    const vertices = new Float32Array(vertexCount * 3 * 3);
    const normals = new Float32Array(vertexCount * 3 * 3);
    
    let offset = 84;
    for (let i = 0; i < vertexCount; i++) {
        //法向量
        const nx = view.getFloat32(offset, true);
        const ny = view.getFloat32(offset + 4, true);
        const nz = view.getFloat32(offset + 8, true);
        offset += 12;
        
        //3个顶点
        for (let j = 0; j < 3; j++) {
            const idx = (i * 3 + j) * 3;
            vertices[idx] = view.getFloat32(offset, true);
            vertices[idx + 1] = view.getFloat32(offset + 4, true);
            vertices[idx + 2] = view.getFloat32(offset + 8, true);
            normals[idx] = nx;
            normals[idx + 1] = ny;
            normals[idx + 2] = nz;
            offset += 12;
        }
        
        offset += 2; // 属性字节数
    }
    
    const result = createMeshData(vertices, normals);
    result.rawVertices = vertices;
    result.rawNormals = normals;
    return result;
}

function createMeshData(vertices, normals) {
    //计算边界框
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    
    for (let i = 0; i < vertices.length; i += 3) {
        minX = Math.min(minX, vertices[i]);
        minY = Math.min(minY, vertices[i + 1]);
        minZ = Math.min(minZ, vertices[i + 2]);
        maxX = Math.max(maxX, vertices[i]);
        maxY = Math.max(maxY, vertices[i + 1]);
        maxZ = Math.max(maxZ, vertices[i + 2]);
    }
    
    //计算缩放和偏移
    const sizeX = maxX - minX;
    const sizeY = maxY - minY;
    const sizeZ = maxZ - minZ;
    const maxSize = Math.max(sizeX, sizeY, sizeZ);
    const scale = 8 / maxSize; // 缩放到合适大小
    
    const offsetX = -(minX + maxX) / 2;
    const offsetY = -(minY + maxY) / 2;
    const offsetZ = -(minZ + maxZ) / 2;
    
    // 计算几何中心到最远点的距离（用于自适应手柄大小）
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;
    let maxDist = 0;
    for (let i = 0; i < vertices.length; i += 3) {
        const dx = vertices[i] - centerX;
        const dy = vertices[i+1] - centerY;
        const dz = vertices[i+2] - centerZ;
        const dist = Math.hypot(dx, dy, dz);
        if (dist > maxDist) maxDist = dist;
    }
    
    //检测特征边缘（锐利边缘）
    const featureEdges = detectFeatureEdges(vertices, normals);
    
    //合并顶点和法向量
    const data = new Float32Array(vertices.length * 2);
    for (let i = 0; i < vertices.length / 3; i++) {
        data[i * 6] = vertices[i * 3];
        data[i * 6 + 1] = vertices[i * 3 + 1];
        data[i * 6 + 2] = vertices[i * 3 + 2];
        data[i * 6 + 3] = normals[i * 3];
        data[i * 6 + 4] = normals[i * 3 + 1];
        data[i * 6 + 5] = normals[i * 3 + 2];
    }
    
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    
    //创建特征边缘VBO
    let featureEdgeVbo = null;
    if (featureEdges.length > 0) {
        featureEdgeVbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, featureEdgeVbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(featureEdges), gl.STATIC_DRAW);
    }
    
    return {
        vbo,
        vertexCount: vertices.length / 3,
        scale,
        offsetX,
        offsetY,
        offsetZ,
        featureEdgeVbo,
        featureEdgeCount: featureEdges.length / 6,  // 每条边2个顶点，每个顶点3个分量
        bboxSize: { x: sizeX, y: sizeY, z: sizeZ },  // 包围盒尺寸
        maxDist: maxDist * scale  // 几何中心到最远点的距离（已缩放）
    };
}

//检测特征边缘（锐利边缘）
function detectFeatureEdges(vertices, normals) {
    const edges = [];
    const edgeMap = new Map();  // 用于存储边和对应的三角形法向量
    
    //遍历所有三角形
    const triangleCount = vertices.length / 9;  // 每个三角形9个顶点分量
    
    for (let i = 0; i < triangleCount; i++) {
        const baseIdx = i * 9;
        
        //三角形的3个顶点
        const v0 = [vertices[baseIdx], vertices[baseIdx + 1], vertices[baseIdx + 2]];
        const v1 = [vertices[baseIdx + 3], vertices[baseIdx + 4], vertices[baseIdx + 5]];
        const v2 = [vertices[baseIdx + 6], vertices[baseIdx + 7], vertices[baseIdx + 8]];
        
        //三角形的法向量
        const n = [normals[baseIdx], normals[baseIdx + 1], normals[baseIdx + 2]];
        
        //三角形的3条边（使用顶点索引作为键）
        const edgeKeys = [
            createEdgeKey(v0, v1),
            createEdgeKey(v1, v2),
            createEdgeKey(v2, v0)
        ];
        
        //将这条边的信息存储到map中
        for (let j = 0; j < 3; j++) {
            const key = edgeKeys[j];
            if (!edgeMap.has(key)) {
                edgeMap.set(key, {
                    v0: j === 0 ? v0 : (j === 1 ? v1 : v2),
                    v1: j === 0 ? v1 : (j === 1 ? v2 : v0),
                    normals: [n]
                });
            } else {
                edgeMap.get(key).normals.push(n);
            }
        }
    }
    
    //检查每条边，如果两个三角形的法向量差异大，则是特征边缘
    // 使用10度阈值 + 凹角检测，避免将曲面近似边误判为特征边
    const angleThreshold = Math.cos(10 * Math.PI / 180);
    
    edgeMap.forEach((edge) => {
        if (edge.normals.length === 2) {
            const n1 = edge.normals[0];
            const n2 = edge.normals[1];
            
            //计算法向量的点积
            const dot = n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2];
            
            // 计算边方向
            const ex = edge.v1[0] - edge.v0[0];
            const ey = edge.v1[1] - edge.v0[1];
            const ez = edge.v1[2] - edge.v0[2];
            const eLen = Math.hypot(ex, ey, ez);
            if (eLen < 1e-10) return;
            const edx = ex/eLen, edy = ey/eLen, edz = ez/eLen;
            
            // 凹角检测：两个法向量在边法平面上的投影是否指向彼此
            // n1_perp = n1 - (n1·e)*e, n2_perp = n2 - (n2·e)*e
            const n1e = n1[0]*edx + n1[1]*edy + n1[2]*edz;
            const n2e = n2[0]*edx + n2[1]*edy + n2[2]*edz;
            const n1px = n1[0] - n1e*edx, n1py = n1[1] - n1e*edy, n1pz = n1[2] - n1e*edz;
            const n2px = n2[0] - n2e*edx, n2py = n2[1] - n2e*edy, n2pz = n2[2] - n2e*edz;
            const n1pLen = Math.hypot(n1px, n1py, n1pz);
            const n2pLen = Math.hypot(n2px, n2py, n2pz);
            
            let isConcave = false;
            if (n1pLen > 1e-6 && n2pLen > 1e-6) {
                // 凹角：两个法向量在边法平面上的投影指向相反方向（点积为负）
                const perpDot = (n1px*n2px + n1py*n2py + n1pz*n2pz) / (n1pLen * n2pLen);
                if (perpDot < -0.1) isConcave = true;
            }
            
            // 如果是凹角边缘，用更宽松的阈值（捕获凹进去的边缘）
            // 如果是普通特征边，用标准阈值
            const threshold = isConcave ? Math.cos(3 * Math.PI / 180) : angleThreshold;
            
            if (dot < threshold) {
                edges.push(
                    edge.v0[0], edge.v0[1], edge.v0[2],
                    edge.v1[0], edge.v1[1], edge.v1[2]
                );
            }
        }
    });
    
    return edges;
}

//创建边的唯一键（使用顶点坐标的哈希）
function createEdgeKey(v0, v1) {
    const precision = 1000;  // 精度
    const p0 = [Math.round(v0[0] * precision), Math.round(v0[1] * precision), Math.round(v0[2] * precision)];
    const p1 = [Math.round(v1[0] * precision), Math.round(v1[1] * precision), Math.round(v1[2] * precision)];
    
    //确保边的方向一致（小的顶点在前）
    if (p0[0] < p1[0] || (p0[0] === p1[0] && p0[1] < p1[1]) || (p0[0] === p1[0] && p0[1] === p1[1] && p0[2] < p1[2])) {
        return `${p0[0]},${p0[1]},${p0[2]}-${p1[0]},${p1[1]},${p1[2]}`;
    } else {
        return `${p1[0]},${p1[1]},${p1[2]}-${p0[0]},${p0[1]},${p0[2]}`;
    }
}

//7. 文件上传处理
const fileInput = document.getElementById('fileInput');
const fileInfo = document.getElementById('fileInfo');
const btnClear = document.getElementById('btnClear');

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    fileInfo.textContent = `加载: ${file.name}...`;
    console.log(`文件信息: ${file.name}, 大小: ${file.size} bytes`);
    
    if (file.name.toLowerCase().endsWith('.stl')) {
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const buffer = event.target.result;
                const view = new DataView(buffer);
                
                //通过文件大小判断格式：二进制 STL = 84 + 面数*50
                const numTriangles = view.getUint32(80, true);
                const expectedBinarySize = 84 + numTriangles * 50;
                const isBinary = (buffer.byteLength === expectedBinarySize);
                
                console.log(`三角面数: ${numTriangles}, 预期二进制大小: ${expectedBinarySize}, 实际大小: ${buffer.byteLength}, 是否二进制: ${isBinary}`);
                
                if (isBinary && numTriangles > 0 && numTriangles < 10000000) {
                    console.log('使用二进制解析器');
                    meshData = parseBinarySTL(buffer);
                } else {
                    console.log('使用 ASCII 解析器');
                    const text = new TextDecoder().decode(buffer);
                    meshData = parseSTL(text);
                }
                
                if (meshData && meshData.vertexCount > 0) {
                    fileInfo.textContent = `✓ ${file.name} (${meshData.vertexCount / 3} 三角面)`;
                    btnClear.style.display = 'inline-block';
                    console.log(`解析成功: ${meshData.vertexCount / 3} 三角面, 缩放: ${meshData.scale}`);
                    // 重置零件位置和旋转状态
                    meshPosition = { x: 0, y: 0, z: 0 };
                    meshRotation = { x: 0, y: 0, z: 0 };
                    isSelected = false;
                    draggingGizmo = null;
                    buildEdgeData();
                } else {
                    fileInfo.textContent = '✗ 未找到几何数据';
                    console.error('解析失败: 未找到顶点数据');
                }
            } catch (err) {
                fileInfo.textContent = `✗ 解析失败: ${err.message}`;
                console.error('解析错误:', err);
            }
        };
        reader.onerror = () => {
            fileInfo.textContent = '✗ 文件读取失败';
            console.error('文件读取失败');
        };
        reader.readAsArrayBuffer(file);
    } else {
        fileInfo.textContent = '✗ 不支持的文件格式，请选择 .stl 文件';
    }
});

btnClear.addEventListener('click', () => {
    if (meshData && meshData.vbo) {
        gl.deleteBuffer(meshData.vbo);
    }
    // 清理边线数据
    if (edgeData.frontVisible) gl.deleteBuffer(edgeData.frontVisible.buffer);
    if (edgeData.frontHidden) gl.deleteBuffer(edgeData.frontHidden.buffer);
    if (edgeData.topVisible) gl.deleteBuffer(edgeData.topVisible.buffer);
    if (edgeData.topHidden) gl.deleteBuffer(edgeData.topHidden.buffer);
    if (edgeData.leftVisible) gl.deleteBuffer(edgeData.leftVisible.buffer);
    if (edgeData.leftHidden) gl.deleteBuffer(edgeData.leftHidden.buffer);
    edgeData = {
        frontVisible: null,
        frontHidden: null,
        topVisible: null,
        topHidden: null,
        leftVisible: null,
        leftHidden: null
    };
    meshData = null;
    fileInput.value = '';
    fileInfo.textContent = '';
    btnClear.style.display = 'none';
    // 重置零件位置和旋转状态
    meshPosition = { x: 0, y: 0, z: 0 };
    meshRotation = { x: 0, y: 0, z: 0 };
    isSelected = false;
    draggingGizmo = null;
});

//8. 手势控制 (MediaPipe Hands)
const videoElement = document.getElementById('video');
const gestureStatus = document.getElementById('gestureStatus');

let prevIndexX = null, prevIndexY = null;
let prevPinchZ = null;
let prevPeaceX = null, prevPeaceY = null;

// 判断手指是否伸出
function isFingerExtended(landmarks, tipIdx, pipIdx) {
    return landmarks[tipIdx].y < landmarks[pipIdx].y;
}

// 判断拇指是否伸出（基于x方向距离）
function isThumbExtended(landmarks) {
    const thumbTip = landmarks[4];
    const thumbIp = landmarks[3];
    const thumbMcp = landmarks[2];
    return Math.hypot(thumbTip.x - thumbMcp.x, thumbTip.y - thumbMcp.y) > 
           Math.hypot(thumbIp.x - thumbMcp.x, thumbIp.y - thumbMcp.y) * 1.2;
}

//估算手部大小（用于判断距离屏幕远近）
function getHandSize(landmarks) {
    const wrist = landmarks[0];
    const middleMcp = landmarks[9];
    return Math.hypot(middleMcp.x - wrist.x, middleMcp.y - wrist.y);
}

function onResults(results) {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
        gestureStatus.textContent = '手势识别: 未检测到手';
        prevIndexX = prevIndexY = null;
        prevPinchZ = null;
        prevPeaceX = prevPeaceY = null;
        return;
    }

    const landmarks = results.multiHandLandmarks[0];
    
    //获取关键点
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];
    
    //手腕位置
    const wrist = landmarks[0];
    
    //判断各手指是否伸出
    const thumbOut = isThumbExtended(landmarks);
    const indexOut = isFingerExtended(landmarks, 8, 6);
    const middleOut = isFingerExtended(landmarks, 12, 10);
    const ringOut = isFingerExtended(landmarks, 16, 14);
    const pinkyOut = isFingerExtended(landmarks, 20, 18);
    
    //计算拇指和食指距离
    const pinchDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
    
    //计算食指和中指距离
    const peaceDist = Math.hypot(indexTip.x - middleTip.x, indexTip.y - middleTip.y);
    
    //手部大小（用于判断距离）
    const handSize = getHandSize(landmarks);
    
    //手势识别优先级：捏合 > 耶手势 > 仅食指 > 张开手掌
    
    //1. 捏合手势：拇指和食指捏在一起，手部靠近/远离 -> 缩放
    if (pinchDist < 0.07) {
        if (prevPinchZ !== null) {
            // 手部变大 = 靠近屏幕 = 缩小视角
            // 手部变小 = 远离屏幕 = 放大视角
            const delta = handSize - prevPinchZ;
            state.targetRadius = Math.max(3, Math.min(50, state.targetRadius - delta * 30));
            gestureStatus.textContent = '手势: 捏合缩放 (靠近缩小/远离放大)';
        }
        prevPinchZ = handSize;
        prevIndexX = prevIndexY = null;
        prevPeaceX = prevPeaceY = null;
    }
    //2. 耶手势：仅食指和中指伸出且并拢 -> 沿视角方向平移
    else if (indexOut && middleOut && !ringOut && !pinkyOut && peaceDist < 0.1) {
        const centerX = (indexTip.x + middleTip.x) / 2;
        const centerY = (indexTip.y + middleTip.y) / 2;
        if (prevPeaceX !== null && prevPeaceY !== null) {
            const dx = (centerX - prevPeaceX) * 500;
            const dy = (centerY - prevPeaceY) * 500;

            // 计算当前视角的相机右方向和上方向 (Z轴向上)
            const sp = Math.sin(state.phi);
            const cp = Math.cos(state.phi);
            const st = Math.sin(state.theta);
            const ct = Math.cos(state.theta);
            // forward = center - eye = [-sp*ct, -sp*st, -cp]
            const fx = -sp * ct, fy = -sp * st, fz = -cp;
            // right = forward × worldUp(0,0,1) = (fy*1 - fz*0, fz*0 - fx*1, fx*0 - fy*0)
            let rx = fy, ry = -fx, rz = 0;
            const rLen = Math.hypot(rx, ry, rz);
            if (rLen > 0.001) { rx /= rLen; ry /= rLen; rz /= rLen; }
            // camUp = right × forward
            const ux = ry * fz - rz * fy;
            const uy = rz * fx - rx * fz;
            const uz = rx * fy - ry * fx;

            //屏幕dy向下为正，相机上方向取反使"上拖上移、下拖下移"
            const panSpeed = state.radius * 0.002;
            state.targetCenterX += (rx * dx + ux * dy) * panSpeed;
            state.targetCenterY += (ry * dx + uy * dy) * panSpeed;
            state.targetCenterZ += (rz * dx + uz * dy) * panSpeed;
            gestureStatus.textContent = '手势: 耶✌️平移';
        }
        prevPeaceX = centerX;
        prevPeaceY = centerY;
        prevIndexX = prevIndexY = null;
        prevPinchZ = null;
    }
    //3. 仅食指伸出 -> 旋转 (左划右移，右划左移)
    else if (indexOut && !middleOut && !ringOut && !pinkyOut) {
        if (prevIndexX !== null && prevIndexY !== null) {
            const dx = (indexTip.x - prevIndexX) * 4;
            const dy = (indexTip.y - prevIndexY) * 4;
            state.targetTheta += dx;  // 取反实现左划右移
            state.targetPhi = Math.max(0.05, Math.min(Math.PI - 0.05, state.targetPhi - dy));
            gestureStatus.textContent = '手势: 食指旋转';
        }
        prevIndexX = indexTip.x;
        prevIndexY = indexTip.y;
        prevPinchZ = null;
        prevPeaceX = prevPeaceY = null;
    }
    //4. 张开手掌：所有手指伸出 -> 仅识别，不操作
    else if (indexOut && middleOut && ringOut && pinkyOut) {
        prevIndexX = prevIndexY = null;
        prevPinchZ = null;
        prevPeaceX = prevPeaceY = null;
        gestureStatus.textContent = '手势: 张开手掌 (已识别)';
    }
    else {
        //其他手势，重置状态
        prevIndexX = prevIndexY = null;
        prevPinchZ = null;
        prevPeaceX = prevPeaceY = null;
        gestureStatus.textContent = '手势: 未识别';
    }
}

//初始化 MediaPipe Hands（带错误处理）
try {
    if (typeof Hands !== 'undefined' && typeof Camera !== 'undefined') {
        const hands = new Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
            }
        });

        hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.7,
            minTrackingConfidence: 0.7
        });

        hands.onResults(onResults);

        const camera = new Camera(videoElement, {
            onFrame: async () => {
                await hands.send({ image: videoElement });
            },
            width: 640,
            height: 480
        });

        camera.start().then(() => {
            gestureStatus.textContent = '手势识别: 就绪';
        }).catch((err) => {
            gestureStatus.textContent = '手势识别: 摄像头启动失败';
            console.error('Camera error:', err);
        });
    } else {
        gestureStatus.textContent = '手势识别: MediaPipe未加载';
        videoElement.style.display = 'none';
        console.warn('MediaPipe Hands 或 Camera 未加载，手势功能不可用');
    }
} catch (err) {
    gestureStatus.textContent = '手势识别: 初始化失败';
    videoElement.style.display = 'none';
    console.error('MediaPipe init error:', err);
}

//启动动画循环
animate();
