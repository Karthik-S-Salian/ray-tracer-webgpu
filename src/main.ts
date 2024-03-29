import fragmentShader from './fragment.wgsl?raw'
import vertexShader from './vertex.wgsl?raw'
import { mat4, vec3 } from 'wgpu-matrix';

const cameraCenter = vec3.fromValues(0,0,0);
const cameraRotation = vec3.fromValues(0,0, 0);

/******************************************************************************* */

if (!navigator.gpu) {
    throw new Error("WebGPU not supported on this browser.");
}

const adapter = await navigator.gpu.requestAdapter({powerPreference:"high-performance"});
if (!adapter) {
    throw new Error("No appropriate GPUAdapter found.");
}

const device = await adapter.requestDevice();

const canvas = document.querySelector<HTMLCanvasElement>("canvas")!;
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

console.log(canvas.width, canvas.height)


const context = canvas.getContext("webgpu")!;
const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
    device: device,
    format: canvasFormat,
});
/************************************************************************ */

// vertex buffer
const cover = 1.0
const vertices = new Float32Array([
    //   X,    Y,
    -cover, -cover, // Triangle 1 (Blue)
    cover, -cover,
    cover, cover,

    -cover, -cover, // Triangle 2 (Red)
    cover, cover,
    -cover, cover,
]);

const vertexBuffer = device.createBuffer({
    label: "Cell vertices",
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});

device.queue.writeBuffer(vertexBuffer, /*bufferOffset=*/0, vertices);

const vertexBufferLayout: GPUVertexBufferLayout = {
    arrayStride: 8,
    attributes: [{
        format: "float32x2",
        offset: 0,
        shaderLocation: 0, // Position, see vertex shader
    }],
};

/************************************************************************/

// uniform buffers 
function createUniformBuffer(value: Float32Array, label: string): GPUBuffer {
    const uniformArray = value;
    const uniformBuffer = device.createBuffer({
        label: label,
        size: uniformArray.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(uniformBuffer, 0, uniformArray)
    return uniformBuffer
}

const windSizeUniformBuffer = createUniformBuffer(
    new Float32Array([canvas.width, canvas.height]), "Window SIze Uniforms")

const camCenterUniformBuffer = createUniformBuffer(cameraCenter  as Float32Array, "camera center uniform")
/************************************************************************* */

//storage buffers ** objects**

interface Sphere {
    center: number[],
    radius: number
    material: {
        type: number,
        attenuation: number[],
        fuzz: number,
        refraction_index: number
    }
}

enum MaterialType {
    Labertian = 0,
    Metal = 1,
    Glass = 2
}

const spheres: Sphere[] = [
    {
        center: [0, -100.5, -1],
        radius: 100,
        material: {
            type: MaterialType.Labertian,
            fuzz: 1.0,
            refraction_index: 1.0,
            attenuation: [0.8, 0.8, 0],
        }
    },
    {
        center: [0, 0, -1],
        radius: 0.5,
        material: {
            type: MaterialType.Labertian,
            fuzz: 0,
            refraction_index: 1.0,
            attenuation: [0.7, 0.3, 0.3],
        }
    },
    {
        center: [-1, 0, -1],
        radius: 0.5,
        material: {
            type: MaterialType.Metal,
            fuzz: 0,
            refraction_index: 1.5,
            attenuation: [.7, .3, 0.5],
        }
    },
    {
        center: [1, 0, -1],
        radius: 0.5,
        material: {
            type: MaterialType.Metal,
            fuzz: 0,
            refraction_index: 1.0,
            attenuation: [0.8, 0.6, 0.2],
        }
    }
]


function createSpheresStorageBuffer(spheres: Sphere[]): GPUBuffer {
    const kCenterOffset = 0;
    const kCategoryOffset = 16 / 4;
    const kAttenuationOffset = 32 / 4;
    const kFuzzOffset = 20 / 4;
    const kElementOffset = 48 / 4;

    const arrayBuffer = new Float32Array(spheres.length * kElementOffset);
    const u32s = new Uint32Array(arrayBuffer.buffer);

    const buffer = device.createBuffer({
        label: "spheres buffer",
        size: arrayBuffer.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    for (const [index, sphere] of spheres.entries()) {
        const offset = index * kElementOffset;
        arrayBuffer.set([...sphere.center, sphere.radius], offset + kCenterOffset);

        const { type, attenuation, fuzz, refraction_index } = sphere.material;

        u32s.set([type], offset + kCategoryOffset)

        arrayBuffer.set([fuzz, refraction_index], offset + kFuzzOffset);
        arrayBuffer.set(attenuation, offset + kAttenuationOffset);

    }

    // Upload all spheres at once
    device.queue.writeBuffer(buffer, 0, arrayBuffer);
    return buffer
}

const spheresStorageBuffer = createSpheresStorageBuffer(spheres);

/************************************************************************ */

const aspect = canvas.width / canvas.height;
const projectionMatrix = mat4.perspective((2 * Math.PI) / 2, aspect, -1, 1000.0);
const modelViewProjectionMatrix = mat4.create();

function getTransformationMatrix() {
    const viewMatrix = mat4.identity();
    mat4.translate(viewMatrix, cameraCenter, viewMatrix);
    mat4.rotate(
        viewMatrix,
        cameraRotation,
        10,
        viewMatrix
    );

    mat4.multiply(projectionMatrix, viewMatrix, modelViewProjectionMatrix);

    return modelViewProjectionMatrix as Float32Array;
}

/********************************************************************** */

const cellShaderModule = device.createShaderModule({
    label: 'Cell shader',
    code: vertexShader + fragmentShader
});


const bindGroupLayout = device.createBindGroupLayout({
    label: "Cell Bind Group Layout",
    entries: [{
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: {}// default uniform
    }, {
        binding: 1,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: {}
    }, {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: { type: "read-only-storage" }
    }, {
        binding: 3,
        visibility: GPUShaderStage.FRAGMENT,
        buffer: {}
    }]
});

const pipelineLayout = device.createPipelineLayout({
    label: "Cell Pipeline Layout",
    bindGroupLayouts: [bindGroupLayout],
});


const cellPipeline = device.createRenderPipeline({
    label: "Cell pipeline",
    layout: pipelineLayout,
    vertex: {
        module: cellShaderModule,
        entryPoint: "vertexMain",
        buffers: [vertexBufferLayout]
    },
    fragment: {
        module: cellShaderModule,
        entryPoint: "fragmentMain2",
        targets: [{
            format: canvasFormat
        }]
    }
});

const uniformProjectionBuffer = device.createBuffer({
    label: "projection matrix",
    size: 4*16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const bindGroup = device.createBindGroup({
    label: "Cell renderer bind group",
    layout: bindGroupLayout,
    entries: [{
        binding: 0,
        resource: { buffer: windSizeUniformBuffer }
    }, {
        binding: 1,
        resource: { buffer: camCenterUniformBuffer }
    },
    {
        binding: 2,
        resource: { buffer: spheresStorageBuffer }
    },{
        binding: 3,
        resource: { buffer: uniformProjectionBuffer }
    }],
});


let moveSpeed = 0.1;

document.addEventListener('keydown', (event) => {
    let dx=0,dy=0,dz=0;
    switch (event.key) {
        case 'w': // Move forward
            dz-=moveSpeed;
            break;
        case 's': // Move backward
            dz+= moveSpeed;
            break;
        case 'a': // Strafe left
            dx -= moveSpeed;
            break;
        case 'd': // Strafe right
            dx+= moveSpeed;
            break;
        case 'q': // Move down (optional)
            dy -= moveSpeed;
            break;
        case 'e': // Move up (optional)
            dy += moveSpeed;
            break;
        default:
            break;
    }
    vec3.add(cameraCenter,vec3.fromValues(dx,dy,dz),cameraCenter)
});


// Define rotation speed
const rotationSpeed = 0.002;

let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };

// Event listener for mouse movement
document.addEventListener('mousemove', (event) => {
    if (isDragging) {
        const deltaX = event.clientX - previousMousePosition.x;
        const deltaY = event.clientY - previousMousePosition.y;

        let dx = -deltaX * rotationSpeed;
        let dy = deltaY * rotationSpeed;

        // Limit vertical rotation to avoid flipping the camera
        dx = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, dx));
        vec3.add(cameraCenter,vec3.fromValues(dx,dy,0),cameraCenter)

        // Update previous mouse position
        previousMousePosition = { x: event.clientX, y: event.clientY };
    }
});

// Event listeners for mouse down and up events
document.addEventListener('mousedown', (event) => {
    isDragging = true;
    previousMousePosition = { x: event.clientX, y: event.clientY };
});

document.addEventListener('mouseup', () => {
    isDragging = false;
});


function getCameraCenter(){
    return cameraCenter as Float32Array
}

function frame() {
    const transformationMatrix = getTransformationMatrix();

    device.queue.writeBuffer(
        uniformProjectionBuffer,
        0,
        transformationMatrix.buffer,
        transformationMatrix.byteOffset,
        transformationMatrix.byteLength
      );
     
      let cameraCenter = getCameraCenter()
      device.queue.writeBuffer(
        camCenterUniformBuffer,
        0,
        cameraCenter.buffer,
        cameraCenter.byteOffset,
        cameraCenter.byteLength
      );

    const encoder = device.createCommandEncoder();

    const pass = encoder.beginRenderPass({
        colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            loadOp: "clear",
            clearValue: { r: 0, g: 0, b: 0.4, a: 1 }, // New line
            storeOp: "store",
        }],
    });

    pass.setPipeline(cellPipeline);
    pass.setVertexBuffer(0, vertexBuffer);
    pass.setBindGroup(0, bindGroup);
    pass.draw(vertices.length / 2);

    pass.end();

    // Finish the command buffer and immediately submit it.
    device.queue.submit([encoder.finish()]);
    requestAnimationFrame(frame);
}

requestAnimationFrame(frame);