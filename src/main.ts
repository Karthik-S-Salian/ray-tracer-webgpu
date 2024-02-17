export { } //just to make it module so can use top level await44

const focalLength = 1.0;
const cameraCenter = new Float32Array([0, 0, 0])


/******************************************************************************* */

if (!navigator.gpu) {
    throw new Error("WebGPU not supported on this browser.");
}

const adapter = await navigator.gpu.requestAdapter();
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

const camCenterUniformBuffer = createUniformBuffer(cameraCenter, "camera center uniform")
/************************************************************************* */

//storage buffers ** objects**

interface Sphere {
    center: number[],
    radius: number
}

function createSpheresStorageBuffer(spheres: Sphere[]): GPUBuffer {
    const values = [];

    for (const sphere of spheres) {
        values.push(...sphere.center, sphere.radius);
    }
    const arrayBuffer = new Float32Array(values);

    const buffer = device.createBuffer({
        label: "spheres buffer",
        size: arrayBuffer.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(buffer, 0, arrayBuffer);
    return buffer
}

const spheres: Sphere[] = [
    {
        center: [0,-100.5,-1],
        radius: 100
    }, 
    {
        center: [0, 0, -1],
        radius: 0.5
    },

]

const spheresStorageBuffer = createSpheresStorageBuffer(spheres);

/************************************************************************ */


const cellShaderModule = device.createShaderModule({
    label: 'Cell shader',
    code: `

    struct VertexOutput {
        @builtin(position) pos: vec4f,
      };

      @vertex
      fn vertexMain(@location(0) pos: vec2f) ->
      VertexOutput {
        var output: VertexOutput;
        output.pos = vec4f(pos, 0, 1);
        return output;
      }
    
    struct Ray {
        origin: vec3f,
        direction: vec3f,
    }
    
    struct Sphere{
        center:vec3f,
        radius:f32
    }

    struct Material{
        albedo: vec3f,
        fuzz: vec3f,
        refraction_index: f32
    }

    struct Hit_record {
        hit:bool,
        point: vec3f,
        normal:vec3f,
        t: f32,
        front_face:bool
    };


    @group(0) @binding(0) var<uniform> window_size: vec2f;
    @group(0) @binding(1) var<uniform> cam_center: vec3f;
    @group(0) @binding(2) var<storage, read> spheres: array<Sphere>;

    fn ray_at(ray:Ray,dist:f32)->vec3f{
        return ray.origin+ray.direction*dist;
    }


    fn hit_sphere(sphere:Sphere,ray:Ray,tmin:f32,tmax:f32)->Hit_record {
        var hit_record:Hit_record;
        let oc = ray.origin - sphere.center;
        let a = dot(ray.direction, ray.direction);
        let half_b = dot(oc, ray.direction);
        let c = dot(oc, oc) - sphere.radius*sphere.radius;
        let discriminant = half_b*half_b - a*c;

        if (discriminant < 0) {
            hit_record.hit=false;
            return hit_record;
        }

        let sqrtd = sqrt(discriminant);

        var root = (-half_b - sqrtd) / a;
        if (root <= tmin || tmax <= root) {
            root = (-half_b + sqrtd) / a;
            if (root <= tmin || tmax <= root){
                hit_record.hit=false;
                return hit_record;
            }
        }

        hit_record.t = root;
        hit_record.point = ray_at(ray,root);
        hit_record.normal = (hit_record.point - sphere.center) / sphere.radius;
        hit_record.front_face = dot(ray.direction, hit_record.normal) < 0;
        if !hit_record.front_face {
            hit_record.normal = -hit_record.normal;
        }
        hit_record.hit = true;
        return hit_record;
    }

    fn hit(ray:Ray,tmin:f32,tmax:f32)->Hit_record{
        var closest_so_far = tmax;
        var hit_record:Hit_record;
        hit_record.hit=false;

        for(var i = 0 ; i < i32(arrayLength(&spheres));i=i+1){
            let sphere = spheres[i];
            let temp_record = hit_sphere(sphere,ray,tmin,closest_so_far);

            if temp_record.hit {
                closest_so_far = temp_record.t;
                hit_record = temp_record;

            }
        }
        return hit_record;
    }
      
    fn ray_color(ray: Ray) -> vec3f {
        
        //let hit_record = hit_sphere(Sphere(vec3f(0,0,-1),0.5),ray,0,10000);
        let hit_record =  hit(ray,0,10000);
        if hit_record.hit {
            return 0.5*(hit_record.normal+1);
        }

        let t = 0.5 * (ray.direction.y + 1.);
        return (1. - t) * vec3(1.) + t * vec3(0.3, 0.5, 1.);
    }

    @fragment 
    fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
        let focus_distance = 1.;
        let aspect_ratio = window_size[0]/window_size[1];
      
        // Map pos from y-down viewport coordinates to camera viewport plane coordinates.
        var uv = input.pos.xy / (window_size-1);
        uv = (2. * uv - vec2(1.)) * vec2(aspect_ratio, -1.);
      
        let direction = vec3(uv, -focus_distance);
        let ray = Ray(cam_center, normalize(direction));
        return vec4(ray_color(ray), 1.);
      }
    `
});


const bindGroupLayout = device.createBindGroupLayout({
    label: "Cell Bind Group Layout",
    entries: [{
        binding: 0,
        visibility:GPUShaderStage.FRAGMENT,
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