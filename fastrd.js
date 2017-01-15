const PCT_B = 0.0001,
      RES = 2048;

function randomCanvas(size) {
  var canvas = document.createElement("canvas"),
      ctx = canvas.getContext('2d');

  canvas.width = size;
  canvas.height = size;

  var imgdata = ctx.createImageData(canvas.width, canvas.height),
      data = imgdata.data;

  for (var i = 0; i < data.length; i += 4) {
    data[i] = 255 - Math.random() * 32;
    data[i + 1] = Math.random() < PCT_B ? 255 : Math.random() * 32;
    data[i + 2] = 0;
    data[i + 3] = 255;
  }
  ctx.putImageData(imgdata, 0, 0);

  for (let i = 0; i < 10; i++) {
    let x = parseInt(Math.random * size),
        y = parseInt(Math.random * size);
    ctx.fillStyle = "black";
    ctx.fillRect(x, y, Math.random() * 100, Math.random() * 100);
  }
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

function createAndSetupTexture(gl) {
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
      filters = {
        normal: [
          0, 0, 0,
          0, 1, 0,
          0, 0, 0
        ],
        edge: [
           -1, -1, -1,
           -1, 8, -1,
           -1, -1, -1
        ],
        laplace: [
           0.05, 0.2, 0.05,
           0.2, -1, 0.2,
           0.05, 0.2, 0.05
        ],
        smooth: [
          1/9., 1/9., 1/9.,
          1/9., 1/9., 1/9.,
          1/9., 1/9., 1/9.
        ]
      },
      canvas = document.getElementById(options.canvasId || 'c'),
      resolution = options.resolution || 512,
      noiseCanvas = randomCanvas(resolution),
      mouseX = 0,
      mouseY = 0,
      mousePressed = false;

  canvas.addEventListener("mousemove", e=>{
    const boundingRect = canvas.getBoundingClientRect();
    mouseX = e.offsetX / boundingRect.width;
    mouseY = 1- e.offsetY / boundingRect.width;
  })

  document.addEventListener("mouseup", e=>{
    mousePressed = false;
  })

  document.addEventListener("mousedown", e=>{
    mousePressed = true;
  })
  
  canvas.width = resolution;
  canvas.height = resolution;
  var gl = canvas.getContext('experimental-webgl'),
      buffer = gl.createBuffer(),
      convolveShader,
      vertexShader,
      positionLocation,
      resolutionLocation,
      mouseXlocation,
      mouseYlocation,
      mousePressedLocation;

  var originalImageTexture = createAndSetupTexture(gl),
      image = document.createElement("img");
  image.src = noiseCanvas.toDataURL();

  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image)

  var textures = [];
  var framebuffers = [];

  for (var ii = 0; ii < 4; ++ii) {
    var texture = createAndSetupTexture(gl);
    textures.push(texture);

    gl.texImage2D(
      gl.TEXTURE_2D, 0, gl.RGBA, image.width, image.height, 0,
      gl.RGBA, gl.UNSIGNED_BYTE, null);

    var fbo = gl.createFramebuffer();
    framebuffers.push(fbo);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  }

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, originalImageTexture);


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

  convolveShader = GLUtils.compileShader(gl, gl.FRAGMENT_SHADER, '2d-fragment-shader');
  vertexShader = GLUtils.compileShader(gl, gl.VERTEX_SHADER, '2d-vertex-shader');
  program = GLUtils.makeProgram(gl, vertexShader, convolveShader);

  GLUtils.linkProgram(gl, program);
  positionLocation = gl.getAttribLocation(program, "a_position");
  resolutionLocation = gl.getUniformLocation(program, "canvasPixels");
  kernelLocation = gl.getUniformLocation(program, "convolutionMatrix");
  yFlipLocation = gl.getUniformLocation(program, "yFlip");

  mouseXLocation = gl.getUniformLocation(program, "mouseX");
  mouseYLocation = gl.getUniformLocation(program, "mouseY");
  mousePressedLocation = gl.getUniformLocation(program, "mousePressed");

  gl.uniform1f(yFlipLocation, 1);

  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
  gl.uniform1i(gl.getUniformLocation(program, "uSampler0"), 0);

  
  gl.uniform1f(resolutionLocation, parseFloat(resolution));

  function setFramebuffer(fbo, width, height) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.uniform1f(resolutionLocation, canvas.width);
    gl.viewport(0, 0, width, height);
  }

  var currentFbo = 0;

  return {
    update: function() {
      setFramebuffer(framebuffers[currentFbo], canvas.width, canvas.height);      
      gl.uniform1fv(kernelLocation, filters["laplace"]);
      gl.uniform1f(mouseXLocation, parseFloat(mouseX));
      gl.uniform1f(mouseYLocation, parseFloat(mouseY));
      gl.uniform1i(mousePressedLocation, mousePressed ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.bindTexture(gl.TEXTURE_2D, textures[currentFbo]);
      currentFbo = (currentFbo + 1) % 2;
    },
    render: function() {
      setFramebuffer(undefined, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    },
    canvas: canvas
  }
}

var fracs = Fracs({
  canvasId: "c",
  resolution: 512
});

function go() {
  requestAnimationFrame(go);

  fracs.update();
  fracs.update();
  fracs.update();
  fracs.render();
}

go();
