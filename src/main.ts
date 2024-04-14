import fragmentShader from './fragment.wgsl?raw'
import vertexShader from './vertex.wgsl?raw'


import { getBGCoverRectVertices,objects as spheres,type Sphere } from './utils';

const cameraCenter = new Float32Array([0, 0, 0])

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

const coverVertices =getBGCoverRectVertices() 
const vertexBuffer = device.createBuffer({
    label: "Cell vertices",
    size: coverVertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});

device.queue.writeBuffer(vertexBuffer, /*bufferOffset=*/0, coverVertices);



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

const camCenterUniformBuffer = createUniformBuffer(cameraCenter, "camera center uniform")
/************************************************************************* */

//storage buffers ** objects**


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
        entryPoint: "fragmentMain",
        targets: [{
            format: canvasFormat
        }]
    }
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
    }],
});

function frame() {

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
    pass.draw(coverVertices.length / 2);

    pass.end();

    // Finish the command buffer and immediately submit it.
    device.queue.submit([encoder.finish()]);
}

frame();