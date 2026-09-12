'use client'

import { useEffect, useRef } from 'react'

const VERT = `
attribute vec2 position;
void main(){gl_Position=vec4(position,0.,1.);}
`

const SCENE_FRAG = `
precision highp float;
uniform vec2 resolution;
uniform float time;
uniform float distance;
uniform float elevation;
uniform float azimuth;
uniform float orbitSpeed;
uniform float roll;
uniform float fov;
uniform float diskInner;
uniform float diskOuter;
uniform int steps;

#define PI 3.14159265358979
#define TAU 6.28318530717959

mat3 rotX(float a){float c=cos(a),s=sin(a);return mat3(1,0,0,0,c,-s,0,s,c);}
mat3 rotY(float a){float c=cos(a),s=sin(a);return mat3(c,0,s,0,1,0,-s,0,c);}
mat3 rotZ(float a){float c=cos(a),s=sin(a);return mat3(c,-s,0,s,c,0,0,0,1);}

float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}

vec3 starfield(vec3 dir){
  float b=0.;
  for(int i=0;i<3;i++){
    float s=pow(2.,float(i));
    vec2 uv=vec2(atan(dir.z,dir.x),asin(dir.y))*s*3.;
    vec2 id=floor(uv);
    vec2 fr=fract(uv)-.5;
    float d=length(fr);
    float h=hash(id+float(i)*7.3);
    if(h>.82){
      float brightness=pow(max(0.,1.-d*8.),3.)*h;
      b+=brightness*(0.6+0.4*sin(time*h*2.+h*PI));
    }
  }
  return vec3(b*.7,b*.8,b);
}

vec3 diskColor(float r,float phi,float t){
  float temp=pow(diskInner/r,0.75);
  vec3 hot=vec3(1.,.6,.1);
  vec3 mid=vec3(1.,.25,.05);
  vec3 cool=vec3(.4,.05,.2);
  vec3 col=mix(cool,mix(mid,hot,temp),temp);
  float swirl=sin(phi*8.-r*4.+t*orbitSpeed*3.)*0.5+0.5;
  col*=0.7+0.5*swirl;
  float edgeFade=smoothstep(diskOuter,diskOuter*.8,r)*smoothstep(diskInner,diskInner*1.2,r);
  float brightness=3.*edgeFade/pow(r/diskInner,1.5);
  return col*brightness;
}

void main(){
  vec2 uv=(gl_FragCoord.xy-.5*resolution)/resolution.y;
  float t=time*orbitSpeed;
  float el=elevation+sin(t*.3)*.05;
  float az=azimuth+t;
  vec3 camPos=vec3(sin(az)*cos(el),sin(el),cos(az)*cos(el))*distance;
  vec3 target=vec3(0.);
  vec3 fwd=normalize(target-camPos);
  vec3 right=normalize(cross(vec3(0.,1.,0.),fwd));
  vec3 up=cross(fwd,right);
  float r=roll;
  vec3 rd=normalize(fwd+uv.x*(cos(r)*right+sin(r)*up)+uv.y*(-sin(r)*right+cos(r)*up));
  rd=rd*mat3(1,0,0,0,cos(fov-1.),sin(fov-1.),0,-sin(fov-1.),cos(fov-1.));

  float rs=2.;
  vec3 col=vec3(0.);
  vec3 pos=camPos;
  vec3 dir=rd;
  float stepSize=.5/float(steps);
  bool hitDisk=false;

  for(int i=0;i<256;i++){
    if(i>=steps)break;
    float rr=length(pos);
    if(rr<rs){col=vec3(0.);break;}
    vec3 grav=-pos/(rr*rr*rr)*rs*.5;
    dir=normalize(dir+grav*stepSize*distance);
    vec3 npos=pos+dir*stepSize*distance;
    if(rr>diskInner&&rr<diskOuter){
      float sy=sign(pos.y);
      float ny=sign(npos.y);
      if(sy!=ny||abs(pos.y)<.05){
        float phi=atan(pos.z,pos.x)+TAU;
        col+=diskColor(rr,phi,time)*.2;
        hitDisk=true;
      }
    }
    pos=npos;
    if(rr>distance*3.)break;
  }
  if(length(pos)>distance*2.5){col+=starfield(normalize(pos));}
  gl_FragColor=vec4(col,1.);
}
`

const BLEND_FRAG = `
precision highp float;
uniform sampler2D scene;
uniform vec2 resolution;
void main(){
  vec2 uv=gl_FragCoord.xy/resolution;
  gl_FragColor=texture2D(scene,uv);
}
`

const BRIGHT_FRAG = `
precision highp float;
uniform sampler2D scene;
uniform vec2 resolution;
void main(){
  vec2 uv=gl_FragCoord.xy/resolution;
  vec4 c=texture2D(scene,uv);
  float lum=dot(c.rgb,vec3(.299,.587,.114));
  gl_FragColor=lum>0.8?c:vec4(0.,0.,0.,1.);
}
`

const BLUR_FRAG = `
precision highp float;
uniform sampler2D tex;
uniform vec2 resolution;
uniform vec2 dir;
void main(){
  vec2 uv=gl_FragCoord.xy/resolution;
  vec4 c=vec4(0.);
  float w[5];w[0]=.227;w[1]=.194;w[2]=.121;w[3]=.054;w[4]=.016;
  c+=texture2D(tex,uv)*w[0];
  for(int i=1;i<5;i++){
    vec2 off=dir*float(i)/resolution;
    c+=texture2D(tex,uv+off)*w[i];
    c+=texture2D(tex,uv-off)*w[i];
  }
  gl_FragColor=c;
}
`

const COMPOSITE_FRAG = `
precision highp float;
uniform sampler2D scene;
uniform sampler2D bloom;
uniform vec2 resolution;
uniform float scrim;
void main(){
  vec2 uv=gl_FragCoord.xy/resolution;
  vec4 s=texture2D(scene,uv);
  vec4 b=texture2D(bloom,uv);
  vec3 col=s.rgb+b.rgb*1.5;
  col=col/(col+vec3(1.));
  col=pow(col,vec3(.4545));
  float vd=length(uv-.5)*2.;
  col*=1.-vd*vd*.3;
  col*=1.-scrim;
  gl_FragColor=vec4(col,1.);
}
`

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  return s
}

function makeProgram(gl: WebGLRenderingContext, frag: string): WebGLProgram {
  const p = gl.createProgram()!
  gl.attachShader(p, compileShader(gl, gl.VERTEX_SHADER, VERT))
  gl.attachShader(p, compileShader(gl, gl.FRAGMENT_SHADER, frag))
  gl.linkProgram(p)
  const buf = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buf)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW)
  const loc = gl.getAttribLocation(p, 'position')
  gl.enableVertexAttribArray(loc)
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
  return p
}

function makeFBO(gl: WebGLRenderingContext, w: number, h: number) {
  const tex = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  const fb = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
  return { tex, fb }
}

function setTex(gl: WebGLRenderingContext, p: WebGLProgram, name: string, unit: number, tex: WebGLTexture) {
  gl.activeTexture(gl.TEXTURE0 + unit)
  gl.bindTexture(gl.TEXTURE_2D, tex)
  gl.uniform1i(gl.getUniformLocation(p, name), unit)
}

interface BlackHoleProps {
  distance?: number
  elevation?: number
  azimuth?: number
  orbitSpeed?: number
  roll?: number
  fov?: number
  diskInner?: number
  diskOuter?: number
  scrim?: number
  steps?: number
  resolution?: number
  className?: string
}

export function BlackHole({
  distance = 8,
  elevation = 0.3,
  azimuth = 0,
  orbitSpeed = 0.15,
  roll = 0,
  fov = 1,
  diskInner = 3,
  diskOuter = 7,
  scrim = 0.3,
  steps = 80,
  resolution = 0.5,
  className = '',
}: BlackHoleProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gl = canvas.getContext('webgl')
    if (!gl) return

    const sceneProg = makeProgram(gl, SCENE_FRAG)
    const brightProg = makeProgram(gl, BRIGHT_FRAG)
    const blurProg = makeProgram(gl, BLUR_FRAG)
    const compositeProg = makeProgram(gl, COMPOSITE_FRAG)

    let sceneFBO: ReturnType<typeof makeFBO>
    let brightFBO: ReturnType<typeof makeFBO>
    let blurHFBO: ReturnType<typeof makeFBO>
    let blurVFBO: ReturnType<typeof makeFBO>
    let W = 0, H = 0

    function resize() {
      W = Math.floor(canvas!.offsetWidth * resolution)
      H = Math.floor(canvas!.offsetHeight * resolution)
      canvas!.width = canvas!.offsetWidth
      canvas!.height = canvas!.offsetHeight
      sceneFBO = makeFBO(gl!, W, H)
      brightFBO = makeFBO(gl!, W, H)
      blurHFBO = makeFBO(gl!, W, H)
      blurVFBO = makeFBO(gl!, W, H)
    }

    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    let start = performance.now()
    let raf: number

    function draw() {
      const t = (performance.now() - start) / 1000

      gl!.viewport(0, 0, W, H)

      // scene pass
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, sceneFBO.fb)
      gl!.useProgram(sceneProg)
      const U = (n: string, v: number | number[]) => {
        const loc = gl!.getUniformLocation(sceneProg, n)
        if (typeof v === 'number') gl!.uniform1f(loc, v)
        else gl!.uniform2fv(loc, v)
      }
      U('time', t)
      U('resolution', [W, H])
      U('distance', distance)
      U('elevation', elevation)
      U('azimuth', azimuth)
      U('orbitSpeed', orbitSpeed)
      U('roll', roll)
      U('fov', fov)
      U('diskInner', diskInner)
      U('diskOuter', diskOuter)
      gl!.uniform1i(gl!.getUniformLocation(sceneProg, 'steps'), steps)
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4)

      // bright extract
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, brightFBO.fb)
      gl!.useProgram(brightProg)
      setTex(gl!, brightProg, 'scene', 0, sceneFBO.tex)
      gl!.uniform2fv(gl!.getUniformLocation(brightProg, 'resolution'), [W, H])
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4)

      // blur h
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, blurHFBO.fb)
      gl!.useProgram(blurProg)
      setTex(gl!, blurProg, 'tex', 0, brightFBO.tex)
      gl!.uniform2fv(gl!.getUniformLocation(blurProg, 'resolution'), [W, H])
      gl!.uniform2fv(gl!.getUniformLocation(blurProg, 'dir'), [1, 0])
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4)

      // blur v
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, blurVFBO.fb)
      gl!.useProgram(blurProg)
      setTex(gl!, blurProg, 'tex', 0, blurHFBO.tex)
      gl!.uniform2fv(gl!.getUniformLocation(blurProg, 'resolution'), [W, H])
      gl!.uniform2fv(gl!.getUniformLocation(blurProg, 'dir'), [0, 1])
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4)

      // composite to screen
      gl!.viewport(0, 0, canvas!.width, canvas!.height)
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, null)
      gl!.useProgram(compositeProg)
      setTex(gl!, compositeProg, 'scene', 0, sceneFBO.tex)
      setTex(gl!, compositeProg, 'bloom', 1, blurVFBO.tex)
      gl!.uniform2fv(gl!.getUniformLocation(compositeProg, 'resolution'), [canvas!.width, canvas!.height])
      gl!.uniform1f(gl!.getUniformLocation(compositeProg, 'scrim'), scrim)
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4)

      raf = requestAnimationFrame(draw)
    }

    draw()
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [distance, elevation, azimuth, orbitSpeed, roll, fov, diskInner, diskOuter, scrim, steps, resolution])

  return (
    <canvas
      ref={canvasRef}
      className={'w-full h-full ' + className}
      style={{ display: 'block' }}
    />
  )
}
