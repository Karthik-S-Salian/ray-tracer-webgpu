struct Ray {
        origin: vec3f,
        direction: vec3f,
    }

struct Material {
        category: u32,
        fuzz: f32,
        refraction_index: f32,
        attenuation: vec3f,
}
    
struct Sphere {
        center: vec3f,
        radius: f32,
        mat: Material
}

struct Hit_record {
        hit: bool,
        point: vec3f,
        normal: vec3f,
        t: f32,
        front_face: bool,
        mat: Material
};

struct BouncedRay {
    direction: vec3f,
    bounce_further: bool
}

@group(0) @binding(0) var<uniform> window_size: vec2f;
@group(0) @binding(1) var<uniform> cam_center: vec3f;
@group(0) @binding(2) var<storage, read> spheres: array<Sphere>;
@group(0) @binding(3) var<uniform> modelViewProjectionMatrix: mat4x4f;
var<private> rng_state:i32;
const PI = f32(3.1415926535897932384626433832795);
const MAX_DEPTH =20;
const ANTIALIASING_SAMPLES=100;


fn random_float() -> f32 {
    rng_state = (rng_state ^ 61) ^ (rng_state >> 16);
    rng_state *= 9;
    rng_state = rng_state ^ (rng_state >> 4);
    rng_state *= 0x27d4eb2d;
    rng_state = rng_state ^ (rng_state >> 15);
    return f32(rng_state) / 4294967296.0;
}

fn random_unit_vector() -> vec3f {
    let theta = random_float() * 2 * PI;
    let phi = random_float() * 2 * PI;

        // Convert spherical coordinates to Cartesian coordinates
    let x = sin(phi) * cos(theta);
    let y = sin(phi) * sin(theta);
    let z = cos(phi);

    return vec3f(x, y, z);
}


fn random_in_unit_disk()->vec2f{
    // let theta = random_float() * 2 * PI;
    // return vec3f(random_float()*sin(theta),random_float()*cos(theta),0);
    while(true){
        let v = vec2f(random_float(),random_float());
        if(length(v)<1){
            return v;
        }
    }
    return vec2f(0,0);
}

fn ray_at(ray: Ray, dist: f32) -> vec3f {
    return ray.origin + ray.direction * dist;
}


fn hit_sphere(sphere: Sphere, ray: Ray, tmin: f32, tmax: f32) -> Hit_record {
    var hit_record: Hit_record;
    let oc = ray.origin - sphere.center;
    let a = dot(ray.direction, ray.direction);
    let half_b = dot(oc, ray.direction);
    let c = dot(oc, oc) - sphere.radius * sphere.radius;
    let discriminant = half_b * half_b - a * c;

    if discriminant < 0 {
        hit_record.hit = false;
        return hit_record;
    }

    let sqrtd = sqrt(discriminant);

    var root = (-half_b - sqrtd) / a;
    if root <= tmin || tmax <= root {
        root = (-half_b + sqrtd) / a;
        if root <= tmin || tmax <= root {
            hit_record.hit = false;
            return hit_record;
        }
    }

    hit_record.t = root;
    hit_record.point = ray_at(ray, root);
    hit_record.normal = (hit_record.point - sphere.center) / sphere.radius;
    hit_record.front_face = dot(ray.direction, hit_record.normal) < 0;
    if !hit_record.front_face {
        hit_record.normal = -hit_record.normal;
    }
    hit_record.hit = true;
    hit_record.mat = sphere.mat;
    return hit_record;
}

fn hit(ray: Ray, tmin: f32, tmax: f32) -> Hit_record {
    var closest_so_far = tmax;
    var hit_record: Hit_record;
    hit_record.hit = false;

    for (var i = 0 ; i < i32(arrayLength(&spheres)); i = i + 1) {
        let sphere = spheres[i];
        let temp_record = hit_sphere(sphere, ray, tmin, closest_so_far);

        if temp_record.hit {
            closest_so_far = temp_record.t;
            hit_record = temp_record;
        }
    }
    return hit_record;
}

fn reflectance(cosine: f32, ri: f32) -> f32 {
        // Use Schlick's approximation for reflectance.
    var r0 = (1 - ri) / (1 + ri);
    r0 = r0 * r0;
    return r0 + (1 - r0) * pow((1 - cosine), 5);
}

fn reflect(ray_direction: vec3f, hit_record: Hit_record) -> BouncedRay {
    let reflected = normalize(ray_direction - 2 * dot(ray_direction, hit_record.normal) * hit_record.normal);

    let scatter_direction = reflected + hit_record.mat.fuzz * random_unit_vector();
    if dot(scatter_direction, hit_record.normal) > 0 {
        return BouncedRay(normalize(scatter_direction), true);
    }
    return BouncedRay(scatter_direction, false);
}

fn scatter(normal: vec3f) -> BouncedRay {
    var scatter_direction = normal + random_unit_vector();
    if all(scatter_direction < vec3f(1e-8)) {
        scatter_direction = normal;
    }
    return BouncedRay(normalize(scatter_direction), true);
}

fn refract(ray_direction: vec3f, rec: Hit_record, ri: f32) -> BouncedRay {
    let cos_theta = min(dot(-ray_direction, rec.normal), 1.0);
    let sin_theta = sqrt(1.0 - cos_theta * cos_theta);
    if ri * sin_theta > 1.0 || reflectance(cos_theta, ri) > random_float() {
        return BouncedRay(normalize(ray_direction - 2 * dot(ray_direction, rec.normal) * rec.normal), true);
    }
    let r_out_perp = ri * (ray_direction + cos_theta * rec.normal);
    let r_out_parallel = -sqrt(abs(1.0 - dot(r_out_perp, r_out_perp))) * rec.normal;
    return BouncedRay(normalize(r_out_perp + r_out_parallel), true);
}
      
fn ray_color(ray: Ray) -> vec3f {
    var attenuation = vec3f(1.);
    var current_ray = ray;

    for (var i = 0; i < MAX_DEPTH; i++) {
        let hit_record = hit(current_ray, 0.00001, 10000);
        var direction: vec3f;
        var bounced_ray: BouncedRay;

        if hit_record.hit {
            // return .5*(hit_record.normal+1);
            switch hit_record.mat.category {
            case 0:{
                    bounced_ray = scatter(hit_record.normal);
                }
            case 1:{
                    bounced_ray = reflect(current_ray.direction, hit_record);
                }
            case 2:{
                    var refraction_ratio = hit_record.mat.refraction_index;
                    if hit_record.front_face {
                        refraction_ratio = 1.0 / refraction_ratio;
                    }
                    bounced_ray = refract(current_ray.direction, hit_record, refraction_ratio);
                }
            default: {
                    bounced_ray = reflect(current_ray.direction, hit_record);
                }
            }
            if bounced_ray.bounce_further {
                direction = bounced_ray.direction;
            } else {
                break;
            }
            current_ray = Ray(hit_record.point, direction);
            attenuation *= hit_record.mat.attenuation;
            //return 0.5*(hit_record.normal+1);
        } else {
            let t = 0.5 * (ray.direction.y + 1.);
            return attenuation * ((1. - t) * vec3(1.) + t * vec3(0.3, 0.5, 1.));
        }
    }
    return vec3f(0, 0, 0);
}

@fragment 
fn fragmentMain(@builtin(position) pos: vec4f) -> @location(0) vec4f {
    // let pos = opos/vec4f(window_size,0,1);
    rng_state = i32(pos.x * pos.y - pos.x + pos.y);

    let vfov: f32 = 20;
    let theta = radians(vfov);
    let h = tan(theta / 2);
    let defocus_angle =0.6;
    let focus_dist = 10.0;
    let aspect_ratio = window_size.x / window_size.y;

    let lookfrom = vec3f(13,2,3);  // Point camera is looking from
    let lookat = vec3f(0, 0,0);   // Point camera is looking at
    let vup = vec3f(0, 1, 0);
    let focal_length = length(lookfrom - lookat);
    let viewport_height = 2 * h * focus_dist;

    let center = lookfrom;

    let w = normalize(lookfrom - lookat);
    let u = normalize(cross(vup, w));
    let v = cross(w, u);

    let viewport_u = viewport_height * aspect_ratio * u;    // Vector across viewport horizontal edge
    let viewport_v = viewport_height * -v;
    let viewport_upper_left = center - (focus_dist * w) - viewport_u / 2 - viewport_v / 2;

      // Calculate the camera defocus disk basis vectors.
    let defocus_radius = focus_dist * tan(radians(defocus_angle / 2));
    let defocus_disk_u = u * defocus_radius;
    let defocus_disk_v = v * defocus_radius;
      
        // Map pos from y-down viewport coordinates to camera viewport plane coordinates.
    let pixel_delta_u = viewport_u/window_size.x;
    let pixel_delta_v = viewport_v/window_size.y;

    let pixel_loc = viewport_upper_left + (pos.x+.5)*pixel_delta_u + (pos.y+.5)*pixel_delta_v;

    var ray_origin = center;

    // if(defocus_angle>0){
    //     let p = random_in_unit_disk();
    //     ray_origin+=  (p[0] * defocus_disk_u) + (p[1] * defocus_disk_v);
        
    // }

    var sum =vec3f(0,0,0);

    for (var i = 0;     i < ANTIALIASING_SAMPLES; i++) {
        let pixel_sample =pixel_loc+ (-0.5+random_float())*pixel_delta_u + (-0.5+random_float())*pixel_delta_v;
        ray_origin = center;

        if(defocus_angle>0){
            let p = random_in_unit_disk();
            ray_origin+=  (p[0] * defocus_disk_u) + (p[1] * defocus_disk_v);
            
        }
        let ray = Ray(ray_origin, normalize(pixel_sample-ray_origin));
        sum += ray_color(ray);
    }

    let averagedColor = sum / f32(ANTIALIASING_SAMPLES);
    return vec4(sqrt(averagedColor), 1.); //sqrt for gamma correction
}