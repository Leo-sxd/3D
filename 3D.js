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
const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
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
varying vec4 vColor;
void main(){
    gl_Position = uMVP * vec4(aPos, 1.0);
    vColor = aColor;
}`;
const FS_LINE = `
precision mediump float;
varying vec4 vColor;
void main(){
    gl_FragColor = vColor;
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
void main(){
    vec3 lightDir = normalize(vec3(0.5, 0.5, 1.0));
    vec3 normal = normalize(vNormal);
    float diff = max(dot(normal, lightDir), 0.0);
    float ambient = 0.3;
    vec3 color = uColor * (ambient + diff * 0.7);
    gl_FragColor = vec4(color, 1.0);
}`;

const lineProgram = createProgram(gl, VS_LINE, FS_LINE);
const meshProgram = createProgram(gl, VS_MESH, FS_MESH);

// 线条程序 uniform/attribute 位置
const lineU_MVP = gl.getUniformLocation(lineProgram, 'uMVP');
const lineAPos = gl.getAttribLocation(lineProgram, 'aPos');
const lineAColor = gl.getAttribLocation(lineProgram, 'aColor');

// 网格程序 uniform/attribute 位置
const meshU_MVP = gl.getUniformLocation(meshProgram, 'uMVP');
const meshU_Model = gl.getUniformLocation(meshProgram, 'uModel');
const meshU_Color = gl.getUniformLocation(meshProgram, 'uColor');
const meshAPos = gl.getAttribLocation(meshProgram, 'aPos');
const meshANormal = gl.getAttribLocation(meshProgram, 'aNormal');

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
for(let i=-G;i<=G;i++){
    const c = i===0 ? 0.3 : 0.15;
    pushLine(i,-G,0, i,G,0, c,c,0.27,1);
    pushLine(-G,i,0, G,i,0, c,c,0.27,1);
}

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
const btnViews = document.getElementById('btnViews');
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
    const DIHEDRAL_THRESHOLD = 0.92; // cos(23°)
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
    
    // 为每个视图构建双深度缓冲区
    // frontBuf: 只用朝前三角形 → 代表"不透视下可见的表面"
    // fullBuf: 用所有三角形 → 代表"完整表面覆盖，无间隙"
    const viewDirs=[[0,-1,0],[0,0,-1],[-1,0,0]];
    const frontDepthBuffers = [];
    const fullDepthBuffers = [];
    
    for(const vd of viewDirs){
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
            if(visCount>hidCount) viewResults[vi].vis.push(a[0],a[1],a[2],b[0],b[1],b[2]);
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

function animate() {
    requestAnimationFrame(animate);

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
    Mat4.lookAt(viewMat, eye, [state.centerX, state.centerY, state.centerZ], [0,0,1]);
    
    //MVP = Proj * View
    const tmp = Mat4.create();
    for(let i=0;i<4;i++) for(let j=0;j<4;j++){
        tmp[j*4+i] = 0;
        for(let k=0;k<4;k++) tmp[j*4+i] += projMat[k*4+i] * viewMat[j*4+k];
    }
    mvpMat.set(tmp);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    //渲染线条（坐标轴+网格）
    gl.useProgram(lineProgram);
    gl.uniformMatrix4fv(lineU_MVP, false, mvpMat);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(lineAPos);
    gl.vertexAttribPointer(lineAPos, 3, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(lineAColor);
    gl.vertexAttribPointer(lineAColor, 4, gl.FLOAT, false, STRIDE, 12);
    gl.drawArrays(gl.LINES, 0, totalVerts);

    //渲染网格模型
    if (meshData && meshData.vbo) {
        gl.useProgram(meshProgram);
        
        //计算模型矩阵（缩放+平移）
        const m = Mat4.create();
        //缩放
        m[0] = meshData.scale;
        m[5] = meshData.scale;
        m[10] = meshData.scale;
        //平移（偏移量需要乘以缩放系数）
        m[12] = meshData.offsetX * meshData.scale;
        m[13] = meshData.offsetY * meshData.scale;
        m[14] = meshData.offsetZ * meshData.scale;
        modelMat.set(m);
        
        //MVP * Model
        const meshMVP = Mat4.create();
        Mat4.multiply(meshMVP, mvpMat, modelMat);
        
        gl.uniformMatrix4fv(meshU_MVP, false, meshMVP);
        gl.uniformMatrix4fv(meshU_Model, false, modelMat);
        gl.uniform3f(meshU_Color, 0.6, 0.7, 0.9);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, meshData.vbo);
        gl.enableVertexAttribArray(meshAPos);
        gl.vertexAttribPointer(meshAPos, 3, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(meshANormal);
        gl.vertexAttribPointer(meshANormal, 3, gl.FLOAT, false, 24, 12);
        
        gl.drawArrays(gl.TRIANGLES, 0, meshData.vertexCount);
    }
    
    // 渲染三视图
    renderThreeViews();
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
    
    return {
        vbo,
        vertexCount: vertices.length / 3,
        scale,
        offsetX,
        offsetY,
        offsetZ
    };
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
