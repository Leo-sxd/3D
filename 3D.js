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
    }
};

//2. WebGL 初始化与着色器编译
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

// 网格 (120x120, 间距1) - XY水平面(z=0)
const G = 60;
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
}

//6. STL 文件解析
let meshData = null;

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
    
    return createMeshData(vertices, normals);
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
    
    return createMeshData(vertices, normals);
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
