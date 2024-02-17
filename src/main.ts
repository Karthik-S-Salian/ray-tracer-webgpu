const WINDOW_HEIGHT = window.innerHeight
const WINDOW_WIDTH = window.innerWidth
const ASPECT_RATIO = WINDOW_WIDTH / WINDOW_HEIGHT
const VIEWPORT_HEIGHT = 2.0
const VIEWPORT_WIDTH = ASPECT_RATIO * VIEWPORT_HEIGHT

const focalLength = 1.0;
const cameraCenter = new Float32Array([0, 0, 0])

export { } //just to make it module so can use top level await

const canvas = document.querySelector<HTMLCanvasElement>("canvas")!;

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const aspect = canvas.width / canvas.height;

// const fov = 60 * Math.PI / 180
// const near = 0.1;
// const far = 1000;
// const perspective = mat4.perspective(fov, aspect, near, far);

// const eye = [3, 5, 10];
// const target = [0, 4, 0];
// const up = [0, 1, 0];
// const view = mat4.lookAt(eye, target, up);

if (!navigator.gpu) {
  throw new Error("WebGPU not supported on this browser.");
} else {
  console.log("webgpu available")
}

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
  throw new Error("No appropriate GPUAdapter found.");
} else {
  console.log("gpu adapter found")
}

const device = await adapter.requestDevice();
const context = canvas.getContext("webgpu")!;

const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
  device: device,
  format: navigator.gpu.getPreferredCanvasFormat(),
});


const vertices = new Float32Array([
  //   X,    Y,
  -0.8, -0.8,
  0.8, -0.8,
  0.8, 0.8,
  -0.8, 0.8,
]);

const vertexBuffer = device.createBuffer({
  label: "Cell vertices",
  size: vertices.byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});

const vertexBufferLayout: GPUVertexBufferLayout = {
  arrayStride: 8,
  attributes: [{
    format: "float32x2",
    offset: 0,
    shaderLocation: 0, // Position, see vertex shader
  }],
};

device.queue.writeBuffer(vertexBuffer, /*bufferOffset=*/0, vertices);

const simulationShaderModule = device.createShaderModule({
  label: "Cell shader",
  code: `
  @vertex
  fn vertexMain(@location(0) pos: vec2f) ->
    @builtin(position) vec4f {
    return vec4f(pos, 0, 1);
  }

    @fragment
    fn fragmentMain() -> @location(0) vec4f {
      return vec4f(1,0,1, 1);
    }
  `
});

const simulationPipeline = device.createRenderPipeline({
  label: "Cell pipeline",
  layout: "auto", // Updated!
  vertex: {
    module: simulationShaderModule,
    entryPoint: "vertexMain",
    buffers: [vertexBufferLayout]
  },
  fragment: {
    module: simulationShaderModule,
    entryPoint: "fragmentMain",
    targets: [{
      format: canvasFormat
    }]
  }
});

// Move all of our rendering code into a function
function updateGrid() {
  const encoder = device.createCommandEncoder();
  // Start a render pass 
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: context.getCurrentTexture().createView(),
      loadOp: "clear",
      clearValue: { r: 0, g: 0, b: 0.4, a: 1.0 },
      storeOp: "store",
    }]
  });

  // Draw the grid.
  pass.setPipeline(simulationPipeline);
  pass.setVertexBuffer(0, vertexBuffer);
  pass.draw(vertices.length / 2);

  // End the render pass and submit the command buffer
  pass.end();
  device.queue.submit([encoder.finish()]);
}

// Schedule updateGrid() to run repeatedly
updateGrid()
// setInterval(updateGrid, 200);