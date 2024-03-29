
// vertex buffer
// rectaangle to cover the entire screen 
export function getBGCoverRectVertices(cover=1.0){
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


export type Sphere = {
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