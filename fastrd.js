const PCT_B = 50,
      RES = 1024;

function randomCanvas(size, randomness) {
  var canvas = document.createElement("canvas"),
      ctx = canvas.getContext('2d');

  canvas.width = size;
  canvas.height = size;

  var imgdata = ctx.createImageData(canvas.width, canvas.height),
      data = imgdata.data;

  for (var i = 0; i < data.length; i += 4) {
    data[i] = 255;
    data[i + 1] = Math.random() * 255;
    data[i + 2] = Math.random() * 100 < PCT_B ? Math.random() * 255 : 0;
    data[i + 3] = 255;
  }
  ctx.putImageData(imgdata, 0, 0);
  return canvas;
}

var GLUtils = {
  // GL -> ProgramType -> DOM ID -> Shader
  compileShader: function(gl, programType, domId) {
    var shaderScript = document.getElementById(domId),
        shaderSource = shaderScript.text,
        shader = gl.createShader(programType);
    gl.shaderSource(shader, shaderSource);
    gl.compileShader(shader);
    var success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
    if (!success) {
      throw "could not compile shader:" + gl.getShaderInfoLog(shader);
    }
    return shader
  },
  // GL -> Shader -> Shader -> Program
  makeProgram: function(gl, vertexShader, fragmentShader) {
    var program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    return program;
  },
  // GL -> Program -> Void
  linkProgram: function(gl, program) {
    gl.linkProgram(program);
    var success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (!success) {
      throw ("program failed to link:" + gl.getProgramInfoLog (program));
    }
    gl.useProgram(program);
  }
}

function createAndSetupTexture(gl, initial_state) {
  var texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  return texture;
}

function Fracs(options) {
  var options = options || {},
      canvas = document.getElementById(options.canvasId || 'c'),
      resolution = options.resolution || RES,
      noiseCanvas = randomCanvas(resolution),
      mouseX = 0,
      mouseY = 0,
      mousePressed = false,
      convolveShader,
      vertexShader,
      positionLocation,
      gravityLocation,
      paintSizeLocation,
      resolutionLocation,
      mouseXlocation,
      mouseYlocation,
      mousePressedLocation,
      daLocation,
      dbLocation,
      fLocation,
      kLocation,
      tLocation,
      textures = [],
      framebuffers = [],
      currentFbo = 0,
      image = document.createElement("img");
  
  canvas.width = resolution;
  canvas.height = resolution;
  var gl = canvas.getContext('experimental-webgl'),
      buffer = gl.createBuffer(),
      originalImageTexture = createAndSetupTexture(gl);

  var textures = [];
  var framebuffers = [];

  for (var ii = 0; ii < 2; ++ii) {
    var texture = createAndSetupTexture(gl);
    textures.push(texture);

    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, RES, RES, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    var fbo = gl.createFramebuffer();
    framebuffers.push(fbo);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  }

  function reset() {

    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE,
                  randomCanvas(resolution, PCT_B)
                    .getContext('2d')
                    .getImageData(0, 0, resolution, resolution));

    gl.bindTexture(gl.TEXTURE_2D, originalImageTexture);
  }

  reset();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array(
      [-1.0, -1.0,
       1.0, -1.0,
      -1.0,  1.0,
      -1.0,  1.0,
       1.0, -1.0,
       1.0,  1.0]),
    gl.STATIC_DRAW
  );

  renderShader = GLUtils.compileShader(gl, gl.FRAGMENT_SHADER, '2d-render-shader');
  convolveShader = GLUtils.compileShader(gl, gl.FRAGMENT_SHADER, '2d-fragment-shader');
  vertexShader = GLUtils.compileShader(gl, gl.VERTEX_SHADER, '2d-vertex-shader');
  program = GLUtils.makeProgram(gl, vertexShader, convolveShader);

  GLUtils.linkProgram(gl, program);
  
  gl.useProgram(program);
  positionLocation = gl.getAttribLocation(program, "a_position");
  kernelLocation = gl.getUniformLocation(program, "convolutionMatrix");
  yFlipLocation = gl.getUniformLocation(program, "yFlip");
  daLocation = gl.getUniformLocation(program, "DA");
  dbLocation = gl.getUniformLocation(program, "DB"); 
  fLocation = gl.getUniformLocation(program, "f");
  kLocation = gl.getUniformLocation(program, "k");
  tLocation = gl.getUniformLocation(program, "t");
  paintSizeLocation = gl.getUniformLocation(program, "paintSize");
  gravityLocation = gl.getUniformLocation(program, "gravity");

  
  mouseXLocation = gl.getUniformLocation(program, "mouseX");
  mouseYLocation = gl.getUniformLocation(program, "mouseY");
  mousePressedLocation = gl.getUniformLocation(program, "mousePressed");

  gl.uniform1f(yFlipLocation, 1);

  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  gl.uniform1i(gl.getUniformLocation(program, "uSampler0"), 0);
  gl.uniform1f(gl.getUniformLocation(program, "canvasPixels"), parseFloat(resolution));

  var renderProgram = GLUtils.makeProgram(gl, GLUtils.compileShader(gl, gl.VERTEX_SHADER, '2d-vertex-shader'), renderShader);
  gl.linkProgram(renderProgram);

  gl.useProgram(renderProgram);
  gl.uniform1i(gl.getUniformLocation(renderProgram, "uSampler0"), 0);
  gl.uniform1f(gl.getUniformLocation(renderProgram, "canvasPixels"), parseFloat(resolution))
  

  function setFramebuffer(fbo, width, height) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, width, height);
  }
  
  function updatePointerPosition(x, y) {
    const boundingRect = canvas.getBoundingClientRect();
    mouseX = x / boundingRect.width;
    mouseY = 1 - y / boundingRect.height;    
  }

  
  canvas.addEventListener("mousemove", e=>{
    updatePointerPosition(e.offsetX, e.offsetY);
  });

  canvas.addEventListener("touchmove", e=>{
    const boundingRect = canvas.getBoundingClientRect();
    console.log(boundingRect, e.touches[0]);
    mousePressed = true;
    updatePointerPosition(e.touches[0].clientX - boundingRect.left, e.touches[0].clientY - boundingRect.top)
  });

  ["mouseup", "touchend"].map(eventType=>
    document.addEventListener(eventType, e=>{
      mousePressed = false;
  }));

  ["mousedown"].map(eventType=>canvas.addEventListener(eventType, e=>{
    mousePressed = true;
  }));

  return {
    update: function(state) {
      gl.useProgram(program);

      gl.uniform1f(mouseXLocation, parseFloat(mouseX));
      gl.uniform1f(mouseYLocation, parseFloat(mouseY));
      gl.uniform1i(mousePressedLocation, mousePressed ? 1 : 0);
      gl.uniform1f(daLocation, parseFloat(state.DA));
      gl.uniform1f(dbLocation, parseFloat(state.DB));
      gl.uniform1f(fLocation, parseFloat(state.f));
      gl.uniform1f(kLocation, parseFloat(state.k));
      gl.uniform1f(tLocation, parseFloat(state.t));
      gl.uniform1f(paintSizeLocation, parseFloat(state.paintSize));
      gl.uniform1f(gravityLocation, parseFloat(state.gravity));
      state.t += 1;
	  gl.bindTexture(gl.TEXTURE_2D, textures[currentFbo % 2]);
	  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffers[(currentFbo + 1) % 2]);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      currentFbo += 1;
    },
    reset,
    render: function() {      
      gl.useProgram(renderProgram);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, textures[0]);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    canvas: canvas
  }
}
