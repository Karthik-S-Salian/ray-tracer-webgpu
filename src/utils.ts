

// rectaangle to cover the entire screen 
export function getBGCoverRectVertices(cover = 1.0) {
    return new Float32Array([
        //   X,    Y,
        -cover, -cover, // Triangle 1 (Blue)
        cover, -cover,
        cover, cover,

        -cover, -cover, // Triangle 2 (Red)
        cover, cover,
        -cover, cover,
    ]);
}

interface FixedLengthArray<L extends number, T> extends Array<T> {
    length: L
}

type Vec3 = FixedLengthArray<3, number>

function vec3(x: number, y: number, z: number) {
    return [x, y, z] as Vec3
}


export type Sphere = {
    center: Vec3,
    radius: number
    material: {
        type: number,
        attenuation: Vec3,
        fuzz: number,
        refraction_index: number
    }
}

enum MaterialType {
    Labertian = 0,
    Metal = 1,
    Dielectric = 2
}

export const spheres: Sphere[] = [
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
        center: [0, 0, -1.2],
        radius: 0.5,
        material: {
            type: MaterialType.Labertian,
            fuzz: 0,
            refraction_index: 1.0,
            attenuation: [0.1, 0.2, 0.5],
        }
    },
    {
        center: [-1, 0, -1],
        radius: 0.5,
        material: {
            type: MaterialType.Dielectric,
            fuzz: 0,
            refraction_index: 1.5,
            attenuation: [1.0, 1.0, 1.0],
        }
    },
    {
        center: [-1, 0, -1],
        radius: 0.4,
        material: {
            type: MaterialType.Dielectric,
            fuzz: 0,
            refraction_index: 1 / 1.5,
            attenuation: [1.0, 1.0, 1.0],
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


function getRandomEnumValue<T extends Record<string, number | string>>(anEnum: T): T[keyof T] {
    //save enums inside array
    const enumValues = Object.keys(anEnum) as Array<keyof T>;

    //Generate a random index (max is array length)
    const randomIndex = Math.floor(Math.random() * enumValues.length);
    // get the random enum value

    const randomEnumKey = enumValues[randomIndex];
    return anEnum[randomEnumKey];
    // if you want to have the key than return randomEnumKey
}

function distance(v1: Vec3, v2: Vec3) {
    const x = v1[0] - v2[0];
    const y = v1[1] - v2[1];
    const z = v1[2] - v2[2];
    return Math.sqrt(x * x + y * y + z * z);

}

export const objects: Sphere[] = [];

const span = 3;

for (let i = -span; i < span; i++) {
    for (let j = -span; j < span; j++) {
        const material = getRandomEnumValue(MaterialType);
        const center = vec3(i + 0.9 * Math.random(), 0.2, j + 0.9 * Math.random())

        if (distance(center, vec3(4, 0.2, 0)) > 0.9) {
            objects.push({
                center: center,
                radius: 0.2,
                material: {
                    type: material,
                    fuzz: Math.random() / 2,
                    refraction_index: 1.5,
                    attenuation: vec3(Math.random(), Math.random(), Math.random()),
                }
            })
        }

    }

}

objects.push({
        center: [0, 1, 0],
        radius: 1,
        material: {
            type: MaterialType.Dielectric,
            fuzz: 1,
            refraction_index: 1.5,
            attenuation: [1, 1, 1],
        }
    }, {
        center: [-4, 1, 0],
        radius: 1,
        material: {
            type: MaterialType.Labertian,
            fuzz: Math.random() / 2,
            refraction_index: 1.5,
            attenuation: [0.4, 0.2, 0.1],
        }
    }, {
        center: [4, 1, 0],
        radius: 1,
        material: {
            type: MaterialType.Metal,
            fuzz: 0,
            refraction_index: 1.5,
            attenuation: [0.7, 0.6, 0.5],
        }
    }, {
        center: [0, -100, 0],
        radius: 100,
        material: {
            type: MaterialType.Labertian,
            fuzz: 0,
            refraction_index: 1.5,
            attenuation: [0.5, 0.5, 0.5],
        }
    }
)

export const Camera2 = {
    samples_per_pixel:500,
    max_depth:50,
    vfov : 20,
    lookfrom: [13,2,3],
    lookat:[0,0,0],
    vup:[0,1,0],
    defocus_angle:0.6,
    focus_dist:10.0,
}


function normalize(v:Vec3):Vec3{
    const [x,y,z] = v;
    const l  = Math.sqrt(x*x+y*y+z*z);
    return [x/l,y/l,z/l];
}

function diff(v1:Vec3,v2:Vec3):Vec3{
    const [x1,y1,z1] = v1;
    const [x2,y2,z2] = v2;
    return [x1-x2,y1-y2,z1-z2]
}


function cross(a:Vec3, b:Vec3) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ] as Vec3
  }

  function scalarMul(v:Vec3,s:number){
    const [x,y,z] = v;
    return [x*s,y*s,z*s] as Vec3
  }
  

// function CameraParams(width:number,height:number){
//     const base = {
//         samples_per_pixel:500,
//         max_depth:50,
//         vfov : 20,
//         lookfrom: [13,2,3] as Vec3,
//         lookat:[0,0,0] as Vec3,
//         vup:[0,1,0] as Vec3,
//         defocus_angle:0.6,
//         focus_dist:10.0,
//     }

//     const deg2rad = (deg:number)=>deg/180*Math.PI

//     const aspect_ratio = width/height;
//     const h = Math.tan(deg2rad(base.vfov/2));
//     const focal_length = distance(base.lookfrom,base.lookat)
//     const viewport_height = 2*h*base.focus_dist;

//     const w= normalize(diff(base.lookfrom,base.lookat));
//     const u = normalize(cross(base.vup,w));
//     const v = cross(w,u);


//     const viewport_u = scalarMul(u,viewport_height * aspect_ratio)   // Vector across viewport horizontal edge
//     const viewport_v = scalarMul(v,-viewport_height);
//     const viewport_upper_left = diff(base.lookfrom, - scalarMul((w,base.fo) - scalarMul(viewport_u,1/2) - scalarMul(viewport_v,1/2))
// }

// let vfov: f32 = 20;
// let theta = radians(vfov);
// let h = tan(theta / 2);
// let defocus_angle =0.6;
// let focus_dist = 10.0;
// let aspect_ratio = window_size.x / window_size.y;

// let lookfrom = vec3f(13,2,3);  // Point camera is looking from
// let lookat = vec3f(0, 0,0);   // Point camera is looking at
// let vup = vec3f(0, 1, 0);
// let focal_length = length(lookfrom - lookat);
// let viewport_height = 2 * h * focus_dist;

// let center = lookfrom;

// let w = normalize(lookfrom - lookat);
// let u = normalize(cross(vup, w));
// let v = cross(w, u);

// let viewport_u = viewport_height * aspect_ratio * u;    // Vector across viewport horizontal edge
// let viewport_v = viewport_height * -v;
// let viewport_upper_left = center - (focus_dist * w) - viewport_u / 2 - viewport_v / 2;

//   // Calculate the camera defocus disk basis vectors.
// let defocus_radius = focus_dist * tan(radians(defocus_angle / 2));
// let defocus_disk_u = u * defocus_radius;
// let defocus_disk_v = v * defocus_radius;
  
//     // Map pos from y-down viewport coordinates to camera viewport plane coordinates.
// let pixel_delta_u = viewport_u/window_size.x;
// let pixel_delta_v = viewport_v/window_size.y;

// let pixel_loc = viewport_upper_left + (pos.x+.5)*pixel_delta_u + (pos.y+.5)*pixel_delta_v;

// var ray_origin = center;
